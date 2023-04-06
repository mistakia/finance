import matplotlib.pyplot as plt

years = [2023, 2022, 2021, 2020, 2019, 2018, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002, 2001, 2000, 1999, 1998, 1997, 1996, 1994, 1993]
counts = [14, 125, 22, 46, 13, 85, 3, 75, 12, 10, 44, 64, 49, 45, 151, 77, 18, 19, 32, 23, 137, 125, 86, 46, 54, 35, 18, 28, 3]

plt.bar(years, counts)
plt.xlabel('Year')
plt.ylabel('Number of Days')
plt.title('Number of Trading Days Per Year where SPY price in 40 days dropped more than 3.5%')
plt.show()
