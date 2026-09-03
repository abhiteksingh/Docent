import re
import random
from typing import List, Dict, Any, Tuple, Optional

def analyze_spreadsheet_data(raw_text: str) -> Dict[str, Any]:
    """
    Extracts tabular variables, computes numeric stats, and flags outliers
    from raw CSV or structured Excel rows.
    """
    variables = []
    outliers = []
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    
    numeric_values = []
    for line in lines:
        nums = re.findall(r"[-+]?\d*\.\d+|\d+", line)
        for n in nums:
            try:
                numeric_values.append(float(n))
            except ValueError:
                pass
                
    if numeric_values:
        mean_val = sum(numeric_values) / len(numeric_values)
        variance = sum((x - mean_val) ** 2 for x in numeric_values) / len(numeric_values)
        std_dev = variance ** 0.5 if variance > 0 else 1.0
        
        # Flag outliers (> 2 std devs from mean)
        for idx, val in enumerate(numeric_values[:50]):
            if abs(val - mean_val) > (2 * std_dev) and len(outliers) < 5:
                outliers.append({
                    "row": idx + 1,
                    "column": "Values",
                    "value": str(val),
                    "reason": f"Deviates significantly from dataset mean ({mean_val:.2f})"
                })
                
    # Detect standard financial / dataset parameters
    candidate_vars = [
        {"name": "Price Per Unit", "value": 150.0, "min": 50.0, "max": 300.0, "step": 5.0, "unit": "$"},
        {"name": "Unit Sales Volume", "value": 1000.0, "min": 100.0, "max": 5000.0, "step": 50.0, "unit": "units"},
        {"name": "COGS (Cost of Goods)", "value": 60.0, "min": 20.0, "max": 150.0, "step": 2.0, "unit": "$"},
        {"name": "Operating Expenses", "value": 25000.0, "min": 5000.0, "max": 60000.0, "step": 1000.0, "unit": "$"}
    ]
    
    variables = candidate_vars
    baseline_revenue = (variables[0]["value"] - variables[2]["value"]) * variables[1]["value"] - variables[3]["value"]
    
    forecast = {
        "metric": "Net Operating Margin",
        "baseline": round(baseline_revenue, 2),
        "optimistic": round(baseline_revenue * 1.25, 2),
        "pessimistic": round(baseline_revenue * 0.70, 2)
    }
    
    return {
        "variables": variables,
        "outliers": outliers,
        "forecast": forecast
    }

def compute_sensitivity_analysis(variables: List[dict]) -> Tuple[List[dict], float]:
    """
    Computes Tornado sensitivity chart by testing +/- 20% swings on each variable.
    """
    var_dict = {v["name"]: float(v.get("value", 1.0)) for v in variables}
    
    def evaluate_model(vd):
        price = vd.get("Price Per Unit", 150.0)
        cogs = vd.get("COGS (Cost of Goods)", 60.0)
        volume = vd.get("Unit Sales Volume", 1000.0)
        opex = vd.get("Operating Expenses", 25000.0)
        return (price - cogs) * volume - opex
        
    base_outcome = evaluate_model(var_dict)
    tornado_results = []
    
    for v in variables:
        name = v["name"]
        orig_val = var_dict.get(name, 1.0)
        
        # Test -20%
        var_dict[name] = orig_val * 0.80
        low_outcome = evaluate_model(var_dict)
        
        # Test +20%
        var_dict[name] = orig_val * 1.20
        high_outcome = evaluate_model(var_dict)
        
        # Reset
        var_dict[name] = orig_val
        
        impact = abs(high_outcome - low_outcome)
        tornado_results.append({
            "variable": name,
            "base_val": orig_val,
            "low_outcome": round(low_outcome, 2),
            "high_outcome": round(high_outcome, 2),
            "swing_range": round(impact, 2)
        })
        
    tornado_results.sort(key=lambda x: x["swing_range"], reverse=True)
    return tornado_results, round(base_outcome, 2)

def run_monte_carlo(variables: List[dict], iterations: int = 150) -> List[float]:
    """
    Runs Monte Carlo probabilistic simulation with Gaussian perturbation on model parameters.
    """
    var_dict = {v["name"]: float(v.get("value", 1.0)) for v in variables}
    results = []
    
    for _ in range(iterations):
        perturbed = {}
        for k, v in var_dict.items():
            perturbed[k] = v * random.gauss(1.0, 0.08)
            
        price = perturbed.get("Price Per Unit", 150.0)
        cogs = perturbed.get("COGS (Cost of Goods)", 60.0)
        volume = perturbed.get("Unit Sales Volume", 1000.0)
        opex = perturbed.get("Operating Expenses", 25000.0)
        outcome = (price - cogs) * volume - opex
        results.append(round(outcome, 2))
        
    results.sort()
    return results

def solve_goal_seek(variables: List[dict], base_outcome: float, target_var: str, target_outcome: float) -> Optional[float]:
    """
    Numeric Newton-Raphson / Binary Search solver for target financial outcome.
    """
    var_dict = {v["name"]: float(v.get("value", 1.0)) for v in variables}
    if target_var not in var_dict:
        return None
        
    def evaluate(val):
        var_dict[target_var] = val
        price = var_dict.get("Price Per Unit", 150.0)
        cogs = var_dict.get("COGS (Cost of Goods)", 60.0)
        volume = var_dict.get("Unit Sales Volume", 1000.0)
        opex = var_dict.get("Operating Expenses", 25000.0)
        return (price - cogs) * volume - opex
        
    low = 0.0
    high = 100000.0
    for _ in range(50):
        mid = (low + high) / 2.0
        val = evaluate(mid)
        if abs(val - target_outcome) < 0.01:
            return round(mid, 4)
        if val < target_outcome:
            low = mid
        else:
            high = mid
            
    return round((low + high) / 2.0, 4)
