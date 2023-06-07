# cross-currency-monitoring-system
The system allows you to calculate the most profitable exchange rate of one currency for another, taking into account the possibility of exchange through intermediate currencies. 
For example, if the direct exchange rate of currency A to B is 2, and the exchange sequence A-C-B allows you to get a rate of 2.5 units of currency B for 1 unit of currency A, then the system will find and return this exchange sequence as the most profitable, if there are no even more profitable currency exchange sequences

**Demonstration**
For 1 USDC coin, you can get 1.000013 USDT coins (rate for June 7, 2023). Using this system, you can find out a more profitable exchange rate of USDC to USDT by exchanging USDC for some intermediate currencies before exchanging for USDT. In this case, the USDT/USDC rate is 1.15

Request:
<img width="764" alt="Снимок экрана 2023-06-07 в 13 29 00" src="https://github.com/sashrass/cross-currency-monitoring-system/assets/62172939/80124d65-c98a-4c4b-8541-e65aca4b3a3e">

Response from system:
<img width="820" alt="Снимок экрана 2023-06-07 в 13 29 08" src="https://github.com/sashrass/cross-currency-monitoring-system/assets/62172939/f3d146ca-06f1-46e3-9cb7-a27873c8fd69">
