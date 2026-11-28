# EcoSuitability

EcoSuitability models habitat suitability for a species within a study area.

## Language

### Analysis inputs

**Occurrence dataset**

A collection of location records for the species being modelled. A tabular occurrence dataset represents locations with latitude and longitude columns.

**Predictor dataset**

A raster representing an environmental variable across a geographic area, such as elevation or land cover.

**Study area**

The geographic intersection of the selected predictor rasters.

**Background points**

Sampled locations that represent available environmental conditions in the study area. They have unknown presence and absence status.

_Avoid_ “absence points”

### Analysis lifecycle

**Dataset complete**

The state of a dataset after its required files have been received and verified and the dataset has been attached to the analysis.

**Inputs ready**

The analysis state after input collection has been completed with one occurrence dataset and at least one predictor dataset attached.

_Avoid_ “ready to run”

**Input profile**

A description of the attached inputs, including available occurrence fields, coverage, and raster characteristics.

**Preflight passed**

A scientific validation outcome confirming that a specific set of inputs and configuration satisfies the checks required to queue the analysis.

**Frozen submission**

The fixed selection of input datasets, configuration, and random seed under which a queued analysis runs.

**Published result**

The verified output of an analysis that is available to its owner, including map layers, diagnostics, and downloadable artifacts.
