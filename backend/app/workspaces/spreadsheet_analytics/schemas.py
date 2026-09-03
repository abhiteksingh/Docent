import re
from pydantic import BaseModel, Field, model_validator
from typing import List, Dict, Any, Optional

class VariableItem(BaseModel):
    name: str = Field(description="EXACT KEY 'name': Variable column or parameter name")
    value: float = Field(default=50.0, description="Current parameter value")
    min: float = Field(default=0.0, description="Minimum parameter bound")
    max: float = Field(default=100.0, description="Maximum parameter bound")
    step: float = Field(default=1.0, description="Slider step increment")
    unit: str = Field(default="", description="Currency or measurement unit (e.g. $, %)")

class TornadoItem(BaseModel):
    name: str = Field(description="EXACT KEY 'name': Variable parameter name")
    swing: float = Field(default=0.0, description="Absolute swing deviation impact")
    min_outcome: float = Field(default=0.0, description="Outcome when parameter is at min")
    max_outcome: float = Field(default=0.0, description="Outcome when parameter is at max")

class OutlierItem(BaseModel):
    row: int = Field(default=1, description="EXACT KEY 'row': Table row number")
    page: int = Field(default=1, description="EXACT KEY 'page': Source page number as an integer")
    description: str = Field(description="EXACT KEY 'description': Why this row or value is anomalous")
    column: Optional[str] = Field(default=None, description="Column name")
    value: Optional[Any] = Field(default=None, description="Anomalous cell value")

    @model_validator(mode="before")
    @classmethod
    def coerce_integers(cls, values: Any) -> Any:
        if isinstance(values, dict):
            for key in ["row", "page"]:
                if key in values and values[key] is not None:
                    digits = re.sub(r"[^\d]", "", str(values[key]))
                    values[key] = int(digits) if digits else 1
            # Support row_index/explanation alias if model generated it
            if not values.get("row") and values.get("row_index"):
                values["row"] = values["row_index"]
            if not values.get("description") and (values.get("explanation") or values.get("reason")):
                values["description"] = values.get("explanation") or values.get("reason")
        return values

class SpreadsheetAnalyticsSchema(BaseModel):
    variables: List[VariableItem] = Field(default_factory=list, description="Extracted mathematical simulation variables")
    outliers: List[OutlierItem] = Field(default_factory=list, description="Detected statistical outliers")
    forecast: Dict[str, Any] = Field(default_factory=dict, description="Historical and future trend points")
    tornado_chart: List[TornadoItem] = Field(default_factory=list, description="Tornado sensitivity parameters")
    outcome_metric: float = Field(default=0.0, description="Evaluated bottom-line outcome metric")
    monte_carlo_distribution: List[float] = Field(default_factory=list, description="Distribution of simulated outcomes across runs")
    assumption_log: List[Dict[str, Any]] = Field(default_factory=list, description="Log of parameter tweaks and scenario changes")
