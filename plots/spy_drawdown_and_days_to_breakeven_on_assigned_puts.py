import matplotlib.pyplot as plt

# Data
year = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2018, 2019, 2020, 2021, 2022]
max_expire_drawdown = [0.08654867112636566, 0.13353845477104187, 0.046029411256313324, 0.011987577192485332,
                       0.028505153954029083, 0.07482758909463882, 0.03798969089984894, 0.11180812120437622,
                       0.029787985607981682, 0.31610429286956787, 0.051899563521146774, 0.13724637031555176]
avg_expire_drawdown = [0.028890089275441448, 0.050442472238955816, 0.015805270643904804, 0.006410784357947044,
                       0.009632052912384392, 0.02356529396162706, 0.015825289374333806, 0.026146020743195313,
                       0.009477360359890922, 0.12767569175720725, 0.013702834917350679, 0.0374850755566743]
max_days_to_breakeven = [97, 98, 21, 4, 7, 43, 7, 99, 6, 87, 1, None]
avg_days_to_breakeven = [23.0150, 13.6758, 2.0500, 1.9091, 2.6341, 12.2839, 1.4688, 6.0597, 1.3787, 26.8067, 0.2766, None]

# Plotting
fig, axs = plt.subplots(2, 2, figsize=(12, 8))
fig.suptitle('Selling 30 to 40DTE puts on SPY 3.5% or more below current price', fontsize=20)
fig.text(0.5, 0.93, "Looking only at the options that resulted in assignment", ha='center', fontsize=12)

axs[0, 0].plot(year, max_expire_drawdown, marker='o')
axs[0, 0].set_title('Maximum Drawdown on expiration')
axs[0, 0].set_xlabel('Year')
axs[0, 0].set_ylabel('Drawdown')

axs[0, 1].plot(year, avg_expire_drawdown, marker='o')
axs[0, 1].set_title('Average Drawdown on expiration')
axs[0, 1].set_xlabel('Year')
axs[0, 1].set_ylabel('Drawdown')

axs[1, 0].plot(year, max_days_to_breakeven, marker='o')
axs[1, 0].set_title('Maximum Days held to Breakeven')
axs[1, 0].set_xlabel('Year')
axs[1, 0].set_ylabel('Days')

axs[1, 1].plot(year, avg_days_to_breakeven, marker='o')
axs[1, 1].set_title('Average Days held to Breakeven')

plt.show()
