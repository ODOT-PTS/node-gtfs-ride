
# GTFS-Ride

[![NPM version](https://img.shields.io/npm/v/gtfs-ride.svg?style=flat)](https://www.npmjs.com/package/gtfs-ride)
[![David](https://img.shields.io/david/ODOT-PTS/node-gtfs-ride.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-ride.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-ride.png?downloads=true)](https://nodei.co/npm/gtfs-ride/)


## Command Line Usage

The `gtfs-ride` command-line utility will import a GTFS file and the Automated Passenger Counter (APC) data and then build [GTFS-ride](https://www.gtfs-ride.org) data.. You can specify the paths of the data as a command line argument or by using a JSON configuuration file.

To use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install gtfs-ride -g

Then you can run `gtfs-ride`.

    gtfs-ride --gtfsPath /path/to/gtfs --apcPath /path/to/apc/data.csv

or

    gtfs-ride --configPath /path/to/your/custom-config.json

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

### exportPath

{String} The path where GTFS Ride data should be exported. Optional, defaults to the directory `output` in the  directory where the script was run.

```
    "exportPath": "/path/where/gtfs/ride/data/should/go"
```

### sqlitePath

{String} A path to an SQLite database. Optional, defaults to using an in-memory database.

```
    "sqlitePath": "/tmp/gtfs"
```

## Visualizing GTFS Ride data

It can be useful to run the example Express application included in the `app` folder as a way to quickly preview all routes or see changes you are making to custom template.

After an initial run of `gtfs-ride`, the GTFS and APC data will be loaded into SQLite and ready to visualize.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `gtfs-ride` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)


## Notes

`gtfs-ride` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/ODOT-PTS/node-gtfs-ride/issues).
