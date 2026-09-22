# Data Dictionary & Schema Specification

## 1. UCI Dataset Overview

The platform processes the **Individual Household Electric Power Consumption Data Set** hosted by the UC Irvine Machine Learning Repository.

- **Origin**: Electric power consumption in one household with a one-minute sampling rate between December 2006 and November 2010 (47 months).
- **Total Rows**: ~2,075,259 observations.
- **Missing Value Marker**: The string `'?'` represents missing readings (e.g. during equipment downtime or sensor communication dropouts ~1.25% of the dataset).

---

## 2. Raw Attributes vs Cleaned Schema

| Raw Column | Raw Type | Cleaned Column | Cleaned Type | Unit | Physical Range | Description / Appliance Mapping |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Date` | String | `date` | String (ISO) | `YYYY-MM-DD` | `2006-12-16` to `2010-11-26` | Observation calendar date (parsed from `DD/MM/YYYY`). |
| `Time` | String | `time` | String | `HH:MM:SS` | `00:00:00` to `23:59:00` | Observation time in 24-hour format. |
| — | — | `timestamp` | Timestamp | ISO 8601 | Standardized UTC | Synthesized combined datetime: `YYYY-MM-DD HH:MM:SS`. |
| `Global_active_power` | String | `global_active_power` | Float | $\text{kW}$ | $0.0 \le P \le 15.0$ | Household global minute-averaged active power. |
| `Global_reactive_power` | String | `global_reactive_power` | Float | $\text{kVAR}$ | $0.0 \le Q \le 5.0$ | Household global minute-averaged reactive power. |
| `Voltage` | String | `voltage` | Float | $\text{V}$ | $180.0 \le V \le 270.0$ | Minute-averaged line voltage ($230\text{V}$ nominal European grid). |
| `Global_intensity` | String | `global_intensity` | Float | $\text{A}$ | $0.0 \le I \le 60.0$ | Household minute-averaged current intensity. |
| `Sub_metering_1` | String | `sub_metering_1` | Float | $\text{Wh}$ | $\ge 0.0$ | **Kitchen**: Dishwasher, microwave, oven. |
| `Sub_metering_2` | String | `sub_metering_2` | Float | $\text{Wh}$ | $\ge 0.0$ | **Laundry Room**: Washing machine, tumble dryer, refrigerator, light. |
| `Sub_metering_3` | String | `sub_metering_3` | Float | $\text{Wh}$ | $\ge 0.0$ | **Climate Systems**: Electric water-heater, air conditioner. |

---

## 3. Mathematical Conversions & Derived Attributes

### 3.1 Active Energy per Minute
The global active power $P$ is recorded in kilowatts ($\text{kW}$). The active electrical energy consumed over a 1-minute interval in watt-hours ($\text{Wh}$) is:
$$E_{\text{active\_minute}} = \frac{P_{\text{kW}} \times 1000}{60} = \frac{P_{\text{kW}} \times 50}{3} \approx 16.6667 \times P_{\text{kW}}$$

### 3.2 Unmeasured Residual Energy
Sub-meterings 1, 2, and 3 represent active energy in $\text{Wh}$ for specific monitored circuits. The unmeasured residual energy (e.g. general lighting, entertainment electronics, small plug loads) is:
$$E_{\text{residual}} = E_{\text{active\_minute}} - (Sub_1 + Sub_2 + Sub_3)$$

### 3.3 Daily Cumulative Energy ($\text{kWh}$)
For $N$ minute-level observations across a calendar day:
$$E_{\text{day}} = \sum_{i=1}^{N} \frac{P_{i}}{60} \text{ kWh}$$

### 3.4 Electrical Power Triangle & Validation
The relationship between active power $P$ ($\text{W}$), voltage $V$ ($\text{V}$), and current intensity $I$ ($\text{A}$) adheres to:
$$P \approx V \times I \times \cos\phi$$
Where $\cos\phi$ is the power factor ($0.0 \le \cos\phi \le 1.0$). If $P > V \times I$, the record violates basic electrical conservation laws and is rejected.

---

## 4. Preprocessing & Quarantine Rules

Records are separated into two destinations during the streaming cleaning phase:
1. **`/user/bda/energy/cleaned/` (`clean_data.tsv`)**:
   - Every column contains valid, parsed numeric values.
   - Values satisfy strict physical validity bounds.
   - Formatted as clean tab-separated values (TSV) with an RFC-compliant header.
2. **`/user/bda/energy/rejected/` (`rejected_records.csv`)**:
   - Any row containing the `'?'` missing value marker in any column.
   - Rows with malformed date/time strings.
   - Rows violating physical boundary constraints (e.g. $V < 180\text{V}$ or $V > 270\text{V}$, or $P < 0$).
   - Appended with an explicit `rejection_reason` column for transparency.
