# Day 16: Coffee Machine (OOP)

The same coffee machine as Day 15, but built with classes. OOP means object-oriented programming: the code is split into small "objects" that each have one job.

- `Menu` and `MenuItem`: the list of drinks and what each one needs
- `CoffeeMaker`: keeps track of the ingredients and makes the drink
- `MoneyMachine`: takes the coins, gives change and keeps track of the profit

`main.py` only runs the loop and asks each class to do its part. The commands are the same as Day 15: a drink name, `report` or `off`.

To run it: `python main.py`
