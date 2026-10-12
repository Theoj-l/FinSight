"""FinSight forecasting: monthly revenue, cost and profit per business unit.

Pipeline (see training/forecast/METHODOLOGY.md for the full method):

    pbalance  ->  monthly P&L per dept (series)  ->  one forecaster per series (methods)
              ->  12 months ahead + a rolling backtest (engine)  ->  forecast_run / forecast_value (run)

Everything is forecast per department. Any selection of departments (a
business unit, a segment, the whole company) is the sum of its departments,
so forecasts add up exactly the way the dashboard adds up actuals.

    revenue  RE, credit - debit                         (dashboard "Revenue")
    cost     CS + EX, debit - credit                     (assistant "total_cost")
    profit   revenue - cost + other income (OI)          (dashboard "Net profit")

Profit is never forecast on its own: it is derived from the revenue, cost and
other-income forecasts, so the three numbers always reconcile.
"""
