from AlgorithmImports import *
from QuantConnect.Securities.Option import OptionPriceModels
from datetime import timedelta
import decimal as d

class WheelAlgorithm(QCAlgorithm):

    def Initialize(self):
        self._no_K = 20       # no of strikes around ATM => for uni selection
        self.MIN_EXPIRY = 30 # min num of days to expiration => for uni selection
        self.MAX_EXPIRY = 60 # max num of days to expiration => for uni selection
        self.MAX_DELTA = d.Decimal(0.3)
        self.MIN_PREMIUM = d.Decimal(0.3)
        self.ticker = "SPY"

        self.SetStartDate(2007, 1, 3)
        self.SetEndDate(2023, 3, 25)
        self.SetCash(100000)
        
        self.resolution = Resolution.Hour
        self.call, self.put, self.takeProfitTicket = None, None, None

        # disable margin calls
        self.Portfolio.MarginCallModel = MarginCallModel.Null
        
        equity = self.AddEquity(self.ticker, self.resolution)
        option = self.AddOption(self.ticker, self.resolution)
        self.symbol = option.Symbol

        # set strike/expiry filter for this option chain
        # option.SetFilter(-3, +3, timedelta(30), timedelta(60))
        
        # set our strike/expiry filter for this option chain
        option.SetFilter(self.UniverseFunc)

        # for greeks and pricer (needs some warmup) - https://github.com/QuantConnect/Lean/blob/21cd972e99f70f007ce689bdaeeafe3cb4ea9c77/Common/Securities/Option/OptionPriceModels.cs#L81
        option.PriceModel = OptionPriceModels.CrankNicolsonFD()  # both European & American, automatically
        
        # this is needed for Greeks calcs
        self.SetWarmUp(TimeSpan.FromDays(60))    # timedelta(7)

        # Set Benchmark
        self.SetBenchmark("SPY")
        # Variable to hold the last calculated benchmark value
        self.lastBenchmarkValue = None
        # Our inital benchmark value scaled to match our portfolio
        self.BenchmarkPerformance = self.Portfolio.TotalPortfolioValue
        
    def OnData(self,slice):
        if (self.IsWarmingUp): return
            
        # If we already have underlying - check if we need to sell covered call
        if self.Portfolio[self.ticker].Invested:
            self.TradeCallOption(slice) 
        
        # check if we can sell a cash covered put
        self.TradePutOption(slice) 

    def OnEndOfDay(self):
        # store the current benchmark close price
        benchmark = self.Securities["SPY"].Close
        # Calculate the performance of our benchmark and update our benchmark value for plotting
        if self.lastBenchmarkValue is not  None:
           self.BenchmarkPerformance = self.BenchmarkPerformance * (benchmark/self.lastBenchmarkValue)
        # store today's benchmark close price for use tomorrow
        self.lastBenchmarkValue = benchmark

        # make our plots
        self.Plot("Strategy vs Benchmark", "Portfolio Value", self.Portfolio.TotalPortfolioValue)
        self.Plot("Strategy vs Benchmark", "Benchmark", self.BenchmarkPerformance)
 
    def TradePutOption(self,slice):
        for i in slice.OptionChains:
            if i.Key != self.symbol: continue
        
            chain = i.Value
            
            # filter the put options contracts
            puts = [x for x in chain if x.Right == OptionRight.Put and abs(x.Greeks.Delta) > 0 and abs(x.Greeks.Delta) < self.MAX_DELTA and x.BidPrice > self.MIN_PREMIUM] 
            
            # sorted the contracts according to their expiration dates and choose the ATM options
            contracts = sorted(sorted(puts, key = lambda x: x.BidPrice, reverse=True), 
                                            key = lambda x: x.Expiry)
                                            
            if len(contracts) == 0: continue  
        
            put_contract = contracts[0]

            # Calculate the existing assignment cost
            options_invested = [x for x in self.Portfolio if x.Value.Invested and x.Value.Type == SecurityType.Option]
            put_options_invested = [option for option in options_invested if option.Key.ID.OptionRight == OptionRight.Put]
            existing_assignment_cost = sum([x.Key.ID.StrikePrice * 100 * abs(x.Value.Quantity) for x in put_options_invested])

            # calculate total assignment cost for all put options
            new_assignment_cost = (put_contract.Strike * 100) + existing_assignment_cost

            # Check if there is enough cash in the portfolio to cover the assignment cost
            if self.Portfolio.Cash < (new_assignment_cost * 0.6):
                return
            
            # short the put options
            self.put = put_contract.Symbol
            ticket = self.MarketOrder(self.put, -1, asynchronous = False)     
            
            # set Take Profit order
            self.takeProfitTicket = self.LimitOrder(self.put, 1, round(d.Decimal(ticket.AverageFillPrice) * d.Decimal(0.5), 2))
    
    def TradeCallOption(self,slice):
        # check holdings to make sure to only sell only as many call options as we have shares of the underlying
        holdings = self.Portfolio[self.symbol].Quantity
        options_invested = [x for x in self.Portfolio if x.Value.Invested and x.Value.Type == SecurityType.Option]
        call_options_invested = [option for option in options_invested if option.Key.ID.OptionRight == OptionRight.Call]
        total_call_options = sum([option.Value.Quantity for option in call_options_invested])
        if total_call_options * 100 - holdings < 100:
            return

        for i in slice.OptionChains:
            if i.Key != self.symbol: continue
        
            chain = i.Value
            
            # filter the put options contracts
            calls = [x for x in chain if x.Right == OptionRight.Call and abs(x.Greeks.Delta) > 0 and abs(x.Greeks.Delta) < self.MAX_DELTA and x.BidPrice > self.MIN_PREMIUM] 
            
            # sorted the contracts according to their expiration dates and choose the ATM options
            contracts = sorted(sorted(calls, key = lambda x: x.BidPrice, reverse=True), 
                                            key = lambda x: x.Expiry)

            if len(contracts) == 0: continue  
        
            self.call = contracts[0].Symbol
            
            # short the call options
            ticket = self.MarketOrder(self.call, -1, asynchronous = False)     
            
            # set Take Profit order
            self.takeProfitTicket = self.LimitOrder(self.call, 1, round(d.Decimal(ticket.AverageFillPrice) * d.Decimal(0.5), 2))
    
 
    def OnOrderEvent(self, orderEvent):
        self.Log(str(orderEvent))
        
    # def OnAssignmentOrderEvent(self, assignmentEvent):
    #     if self.takeProfitTicket != None:
    #         self.takeProfitTicket.cancel();
    #         self.takeProfitTicket = None

    def UniverseFunc(self, universe):
        return universe.IncludeWeeklys()\
                        .Strikes(-self._no_K, self._no_K)\
                        .Expiration(timedelta(self.MIN_EXPIRY), timedelta(self.MAX_EXPIRY))
                        
    def OnFrameworkData(self):
        return