
# GTFS-Ride

[![NPM version](https://img.shields.io/npm/v/gtfs-ride.svg?style=flat)](https://www.npmjs.com/package/gtfs-ride)
[![David](https://img.shields.io/david/blinktaginc/gtfs-ride.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-ride.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-ride.png?downloads=true)](https://nodei.co/npm/gtfs-ride/)


## Command Line Usage

The `gtfs-ride` command-line utility will download the GTFS file specified in `config.js` and then build GTFS-ride data.

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
| [`gtfs`](#gtfs) | object | Information about the GTFS and GTFS-RT to be used. |
| [`sqlitePath`](#sqlitepath) | string | A path to an SQLite database. Optional, defaults to using an in-memory database. |

### gtfs

{Object} Specify the GTFS file to be imported in an `gtfs` object. Static GTFS files can be imported via a `url` or a local `path`.

`agency_key` is a short name you create that is specific to that GTFS file.

`gtfs_static_url` is the URL of an agency's static GTFS. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_static_path` is the local path to an agency's static GTFS on your local machine. Either `gtfs_static_url` or `gtfs_static_path` is required.

* Specify a download URL for static GTFS:
```
{
  "gtfs": {
    "agency_key": "marintransit",
    "gtfs_static_url": "https://marintransit.org/data/google_transit.zip"
  }
}
```

* Specify a path to a zipped GTFS file:
```
{
  "gtfs": {
    "agency_key": "marintransit",
    "gtfs_static_path": "/path/to/the/gtfs.zip"s
  }
}
```
* Specify a path to an unzipped GTFS file:
```
{
  "gtfs": {
    "agency_key": "marintransit",
    "gtfs_static_path": "/path/to/the/unzipped/gtfs"
  }
}
```

### sqlitePath

{String} A path to an SQLite database. Optional, defaults to using an in-memory database.

```
    "sqlitePath": "/tmp/gtfs"
```

## Notes

`gtfs-ride` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/gtfs-ride/issues).
