// Default transfer detection rules configuration
export default {
  ally: [
    /internet transfer/i,
    /credit crd/i,
    /ach transfer/i,
    /ach pmt/i,
    /requested transfer/i,
    /treasury/i,
    /venmo cashout/i,
    /capital one/i,
    /wealthfront/i,
    /groundfloor/i,
    /robinhood/i,
    /schwab/i,
    /fid bkg svc llc moneyline/i
  ],
  amex: [/autopay payment/i, /renewal membership fee/i, /intuit/i, /turbotax/i],
  capital_one: [
    /capital one (auto|mobile|online) pymt/i,
    /payment\/credit/i,
    /^capital one autopay pymt$/i // Exact match for autopay format
  ],
  chase: [/automatic payment/i, /^payment$/i],
  // Special case for chase type field
  chase_payment_type: 'Payment'
}
