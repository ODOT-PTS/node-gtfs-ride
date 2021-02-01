
# GTFS-Ride

[![NPM version](https://img.shields.io/npm/v/gtfs-ride.svg?style=flat)](https://www.npmjs.com/package/gtfs-ride)
[![David](https://img.shields.io/david/blinktaginc/gtfs-ride.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-ride.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-ride.png?downloads=true)](https://nodei.co/npm/gtfs-ride/)


## Command Line Usage

The `gtfs-ride` command-line utility will import a GTFS file and the Automated Passenger Counter (APC) data specified in `config.js` and then build [GTFS-ride](https://www.gtfs-ride.org) data.

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install gtfs-ride -g

Then you can run `gtfs-ride`.

    gtfs-ride

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `gtfs-ride` will look for a `config.json` file in the directory it is being run from.

    gtfs-ride --configPath /path/to/your/custom-config.json

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option | type | description |
| ------ | ---- | ----------- |
| [`agencyKey`](#agencykey) | string | A short name representing the agency. |
| [`apcPath`](#apcpath) | string | The local path to an APC CSV data file. |
| [`apcType`](#apctype) | string | The type of APC data. |
| [`apcUrl`](#apcurl) | string | A URL to of an APC CSV data file. |
| [`gtfsPath`](#gtfspath) | string | The local path to a static GTFS file. |
| [`gtfsUrl`](#gtfsurl) | string | A URL of an agency's static GTFS. |
| [`sqlitePath`](#sqlitepath) | string | A path to an SQLite database. Optional, defaults to using an in-memory database. |


### agencyKey 

{String} A short name you create that is specific to that GTFS file.

```
    "agencyKey": "bart"
```

### apcPath

{String} The local path to an APC CSV file. Either `apcUrl` or `apcPath` is required.

```
    "apcPath": "/path/to/the/apc.csv"
```

### apcType

{String} The type of APC data. Valid options are `cet`, `rvtd` and `ltd`.

```
    "apcType": "cet"
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

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/gtfs-ride/issues).
