
# GTFS-Ride

[![NPM version](https://img.shields.io/npm/v/gtfs-ride.svg?style=flat)](https://www.npmjs.com/package/gtfs-ride)
[![David](https://img.shields.io/david/ODOT-PTS/node-gtfs-ride.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-ride.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-ride.png?downloads=true)](https://nodei.co/npm/gtfs-ride/)

## About GTFS-Ride

`gtfs-ride` is a command-line utility for creating [GTFS-Ride](https://www.gtfsride.org) formatted data. GTFS-Ride is a format for storing transit ridership data. It takes two inputs: a GTFS file and Automated Passenger Counter (APC) data and exports GTFS-Ride data.

## Supported APC data formats

Currently, `gtfs-ride` works for ridership data in the following APC data formats:

* CET
* Cherriots
* LTD
* RVTD
* WETA

The type of APC data format is auto-detected based on the field names in the APC data. If `gtfs-ride` can not detect the type, it will throw an error.

## How it works

`gtfs-ride` allows you to specify which GTFS and APC data to use as command-line arguments or by using a JSON configuration file. An example of a configuration file is located in this repo as `config-sample.json`.

1. Run `gtfs-ride` command-line tool
2. Specify GTFS file and APC data covering the same time period using command-line arguments or via JSON configuration file.
3. `gtfs-ride` imports specified GTFS into SQLite using [`node-gtfs`](https://github.com/blinktaginc/node-gtfs)
4. `gtfs-ride` imports specified APC data into SQLite. The type of APC data is auto-detected.
5. Errors and issues while importing APC data are logged to a `log.txt` file included in the `output` folder.
6. Valid GTFS-Ride data is exported to the `output` folder.


## Command Line Usage

### Setup

* Install node.js https://nodejs.org/en/download/


* Install `gtfs-ride` globally directly from [npm](https://npmjs.org):

    npm install gtfs-ride -g


### Usage

See command-line options below for more information.

    gtfs-ride --gtfsPath /path/to/gtfs --apcPath /path/to/apc/data.csv

or

    gtfs-ride --configPath /path/to/your/custom-config.json

This will import APC and GTFS data from the paths specified and output a GTFS-Ride file.

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `gtfs-ride` will look for a `config.json` file in the directory it is being run from.

    gtfs-ride --configPath /path/to/your/custom-config.json

`gtfsPath`

Specify a local path to GTFS, either zipped or unzipped.

    gtfs-ride --gtfsPath /path/to/your/gtfs.zip

or 
    
    gtfs-ride --gtfsPath /path/to/your/unzipped/gtfs

`gtfsUrl`

Specify a URL to a zipped GTFS file.
    
    gtfs-ride --gtfsUrl http://www.bart.gov/dev/schedules/google_transit.zip

`apcPath`

Specify a local path to APC CSV data.
    
    gtfs-ride --apcPath /path/to/your/apcdata.csv

`apcUrl`

Specify a URL to APC CSV data.
    
    gtfs-ride --apcUrl http://www.myagency.com/apcdata.csv

`exportPath`

Specify where to export GTFS Ride data to. Defaults to `./output`.

    gtfs-ride --exportPath /path/where/data/should/go

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option | type | description |
| ------ | ---- | ----------- |
| [`apcPath`](#apcpath) | string | The local path to an APC CSV data file. |
| [`apcUrl`](#apcurl) | string | A URL to of an APC CSV data file. |
| [`exportPath`](#exportpath) | string | The path where GTFS Ride data should be exported. |
| [`gtfsPath`](#gtfspath) | string | The local path to a static GTFS file. |
| [`gtfsUrl`](#gtfsurl) | string | A URL of an agency's static GTFS. |
| [`mergeDuplicateBoardAlights`](#mergeduplicateboardalights) | boolean | Whether or not to merge duplicate board-alight records by summing them. Defaults to `false`. |
| [`sqlitePath`](#sqlitepath) | string | A path to an SQLite database. Optional, defaults to using an in-memory database. |

### apcPath

{String} The local path to an APC CSV file. Either `apcUrl` or `apcPath` is required.

```
    "apcPath": "/path/to/the/apc.csv"
```

### apcUrl

{String} A URL to of an APC CSV. Either `apcUrl` or `apcPath` is required.

```
    "apcUrl": "https://bart.gov/data/apc.csv"
```

### exportPath

{String} The path where GTFS Ride data should be exported. Optional, defaults to the directory `output` in the  directory where the script was run.

```
    "exportPath": "/path/where/gtfs/ride/data/should/go"
```

### gtfsPath

{String} The local path to a static GTFS file. Can be zipped or unzipped. Either `gtfsUrl` or `gtfsPath` is required.

* Specify a path to a zipped GTFS file:
```
    "gtfsPath": "/path/to/the/gtfs.zip"
```
* Specify a path to an unzipped GTFS file:
```

    "gtfsPath": "/path/to/the/unzipped/gtfs"
```

### gtfsUrl

{String} A URL of an agency's static GTFS. Either `gtfsUrl` or `gtfsPath` is required.

```
    "gtfsUrl": "https://bart.gov/data/google_transit.zip"
```

### mergeDuplicateBoardAlights

{Boolean} Whether or not to merge duplicate board-alight records by summing them. Defaults to `false`.

```
    "mergeDuplicateBoardAlights": "false
```

### sqlitePath

{String} A path to an SQLite database. Optional, defaults to using an in-memory database.

```
    "sqlitePath": "/tmp/gtfs"
```

## Visualizing and Exporting GTFS Ride data

Use the [Ridership App](https://github.com/ODOT-PTS/ridership-app) to visualize and export ridership data.

## Notes

`gtfs-ride` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/ODOT-PTS/node-gtfs-ride/issues).
