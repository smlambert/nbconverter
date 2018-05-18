isBrowser = typeof window == 'object';

var fs;
if (isBrowser) {
    fs = require('browserify-fs');
} else {
    fs = require('fs');
}

function outputToConsole(log) {
    if (isBrowser) {
        var args = Array.prototype.slice.call(arguments);
        var text = document.getElementById("outputtext");
        for (var i = 0; i < args.length; i++) {
            text.value += args[i] + " ";
        }
        text.value += "\n";
    } else {

        var args = Array.prototype.slice.call(arguments);
        console.log.apply(console, args);
    }
}

function testOutput() {
    outputToConsole("CONSOLE OUTPUT");
}
if (!isBrowser) {
    var args = process.argv.splice(2);
    if (args.length != 1) {
        outputToConsole("You must pass a file name to convert as the first parameter.");
        outputToConsole("Usage:", process.argv[0], " csv-filename");
        process.exit(0);
    }
    convertCVSToXML(args[0]);
}

if (isBrowser) {
    window.testOutput = testOutput;
    window.convertCVSToXML = convertCVSToXML;
}

function browserReadTextFile(file, handler) {
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", file, false);
    rawFile.onreadystatechange = function() {
        if (rawFile.readyState === 4) {
            if (rawFile.status === 200 || rawFile.status == 0) {
                var allText = rawFile.responseText;
                handler(allText);
            }
        }
    }
    rawFile.send(null);
}


function convertCVSToXML(csvFile) {
    if (csvFile == undefined) csvFile = 'rawdata.csv';
    var inputfile = csvFile;
    var outputfile = "mapdata.xml";
    var logfile = outputfile + '.log';
    var autolatlong = "autolatlong.json";
    var manuallatlong = "manuallatlong.json";

    outputToConsole("Input File ", inputfile);
    outputToConsole("Outputfile File ", outputfile);
    outputToConsole("Logfile File ", logfile);
    outputToConsole("autolatlong File ", autolatlong);
    outputToConsole("manuallatlong File ", manuallatlong);

    var map = new Map();
    var nameToId = new Map();
    var Converter = require("csvtojson").Converter;
    var converter = new Converter({});
    var missingCount = 0;

    function xmlit(tag, content) {
        content = String(content);
        var c = (content ? content.replace(/&/g, '&amp;') : "");
        if (c.length == 0) {
            c = " ";
        }
        return "    <" + tag + ">" + c + "</" + tag + ">\n";
    }

    function generateTag(obj, xmlField, nationBuilderFieldOrFunction) {
        var nationbuilderdata = "";
        if (typeof nationBuilderFieldOrFunction == 'function') {
            nationbuilderdata = nationBuilderFieldOrFunction(obj);
        } else {
            nationbuilderdata = obj[nationBuilderFieldOrFunction];
        }

        if (nationbuilderdata == undefined) {
            var nbid = obj.nationbuilder_id;
            nationbuilderdata = "";
        }

        return xmlit(xmlField, nationbuilderdata);
    }

    var outputLines = [];

    function output(line) {
        outputLines.push(line);
    }

    var logoutput = [];

    function log(line) {
        logoutput.push(line);
    }

    function outputXML() {
        outputToConsole("Creating: ", outputfile);
        var stream = fs.createWriteStream(outputfile);
        stream.once('open', function(fd) {
            stream.write("");
            stream.write('<?xml version="1.0" encoding="UTF-8"?>');
            stream.write('<?xml-stylesheet type="text/xsl" href="mapdata.xsl"?>');
            stream.write("\n<markers>\n");

            for (var i = 0; i < outputLines.length; i++) {
                stream.write(outputLines[i]);
            }
            stream.write("</markers>");
            stream.end();
        });
    }

    function outputLog() {
        outputToConsole("Creating: ", logfile);
        var stream = fs.createWriteStream(logfile);
        stream.once('open', function(fd) {
            for (var i = 0; i < logoutput.length; i++) {
                stream.write(logoutput[i]);
                stream.write("\n");
            }
            stream.end();
        });
    }

    function getOrgType(entry) {
        // Basis for choosing map icon (need an icon for each of these maptypes)
        // 1 row in csv file can be 1 or more of the following:
        // foodservices, producers, retailer, market, microprocessor, breweries_and_wineries
        if (entry.retailers == 'true') {
            return "retailer";
        } else if (entry.markets == 'true') {
            return "markets";
        } else if (entry.foodservice == 'true') {
            return "foodservices";
        }
        /* else if (entry.microprocessor == 'true') {
               return "microprocessor";
           } else if (entry.breweries_and_wineries == 'true') {
               return "breweries_and_wineries";
           } */
        return "producers";
    }

    function getFarmType(entry) {
        // applies to producers, 1 or more: csa, pick-your-own
        var farmtype = ",csa";
        if (entry.pick_your_own == 'true') {
            farmtype = farmtype + ",pick_your_own";
        }
        return farmtype.substring(1);
    }

    function getProductsList(entry) {
        // if maptype is producer, they can produce 0 or more of the following products:
        // fruits, vegetables, grains_seeds, meat, poultry_eggs, sweeteners, herb_grower
        var products = ",fv-vegetables";
        if (entry.fruits == 'true') {
            products = products + ",ff-fruits"
        }
        if (entry.grains_seeds == 'true') {
            products = products + ",fg-grains_seeds"
        }
        if (entry.meat == 'true') {
            products = products + ",fm-meat"
        }
        if (entry.poultry_eggs == 'true') {
            products = products + ",fm-poultry_eggs"
        }
        if (entry.sweeteners == 'true') {
            products = products + ",fs-sweeteners"
        }
        if (entry.herb_grower == 'true') {
            products = products + ",fh-herbs"
        }
        return products.substring(1);
    }

    function getProductionPractice(entry) {
        // if maptype is producer, 1 row in csv file can only be 1 of the following:
        // eco, cert_org, conventional
        if (entry.certified_organic == 'true') {
            return "certorg";
        } else if (entry.self_identified_ecological_practises == 'true') {
            return "self_identified_ecological";
        }
        return "conventional";
    }

    function getPurchaseType(entry) {
        // buyonline, farmstand, 0 or more
        // this information was not previously available, buyonline applies to all maptypes
        var purchaseType = " ";

        if (entry.buy_online == 'true') {
            purchaseType = purchaseType + ",buy_online";
        }
        if (entry.farm_stand == 'true') {
            purchaseType = purchaseType + ",farm_stand";
        }
        return purchaseType.substring(1);
    }

    function getSOMembership(entry) {
        if (entry.membership == 'true') {
            return true;
        }
        return false;
    }

    function getFullAddress(entry, delimiter) {
        var fullAddress = "";
        var delim = "";
        if (entry.primary_address1) {
            fullAddress = fullAddress + delim + entry.primary_address1;
            delim = delimiter;
        }
        if (entry.primary_city) {
            fullAddress = fullAddress + delim + entry.primary_city;
            delim = delimiter;
        }
        if (entry.primary_state) {
            fullAddress = fullAddress + delim + entry.primary_state;
            delim = delimiter;
        }
        if (entry.primary_country_code) {
            fullAddress = fullAddress + delim + entry.primary_country_code;
            delim = delimiter;
        }
        if (entry.primary_zip) {
            fullAddress = fullAddress + delim + entry.primary_zip;
        }
        return fullAddress;
    }

    function getInfoWindow(entry) {
        var details = "<![CDATA[";
        if (entry.full_name) {
            details = details + "\n<strong>" + entry.full_name + "</strong>\n<br/>";
        }
        details = details + getFullAddress(entry, ", ");
        if (entry.phone_number) {
            details = details + "\n<br/>" + entry.phone_number;
        }
        if (entry.email) {
            details = details + "\n<br/><a href=\"mailto:" + entry.email + "\">" + entry.email + "</a>";
        }
        if (entry.website) {
            details = details + "\n<br/><a target=\"_blank\" href=\"" + entry.website + "\">" + entry.website + "</a>";
        }
        if (entry.twitter_login) {
            details = details + "\n<br/>twitter: @" + entry.twitter_login;
        }
        details = details + "\n]]>";
        return details;
    }

    var xmlTagToNBName = {
        "name": "full_name",
        "nbid": "nationbuilder_id",
        "lat": "lat",
        "lng": "lng",
        "orgtype": getOrgType,
        "savour": getSOMembership,
        "farmtypes": getFarmType,
        "favorites": getProductsList,
        "productiontypes": getProductionPractice,
        //"purchasetypes": getPurchaseType,
        "infowindow": getInfoWindow,
        "email": "email",
        "website": "website",
        "icon": getOrgType
    };

    fs.readFile(autolatlong, 'utf8', function(err, alatlong) {
        outputToConsole("Read Files ...", autolatlong);
        if (err) {
            return console.log(err);
        }
        var latlongmap = JSON.parse(alatlong);
        fs.readFile(manuallatlong, 'utf8', function(err, manlatlong) {
            outputToConsole("Read Files ...", manuallatlong);
            if (err) {
                return console.log(err);
            }
            var manlatlongmap = JSON.parse(manlatlong);
            outputToConsole("latlongmap ...", latlongmap);

            for (var field in manlatlongmap) { latlongmap[field] = manlatlongmap[field]; }
            outputToConsole("Done Reading Files ...");
            converter.fromFile(inputfile, function(err, jsonArray) {
                outputToConsole("Convertering ...", jsonArray);
                for (var i = 0, l = jsonArray.length; i < l; i++) {
                    var obj = jsonArray[i];
                    output("<marker>\n");
                    var xmltags = Object.keys(xmlTagToNBName);
                    obj.showHeader = true;

                    var existing = latlongmap[String(obj.nationbuilder_id)];
                    if (existing) {
                        outputToConsole("Using Existing lat/lng for NBID ", obj.nationbuilder_id, existing)
                        if (existing.lat) {
                            obj['lat'] = existing.lat;
                        }
                        if (existing.lng) {
                            obj['lng'] = existing.lng;
                        }
                    } else {
                        outputToConsole("Use Just Food co-ordinates - no Known LAT for NBID ", obj.nationbuilder_id);
                        obj['lat'] = '45.4266482';
                        obj['lng'] = '-75.5792722';
                    }

                    xmltags.forEach(function callback(xmlkey, index, array) {
                        output(generateTag(obj, xmlkey, xmlTagToNBName[xmlkey]));
                    });
                    output("</marker>\n");
                }
                outputToConsole("About to outputXML");

                outputXML();
                outputToConsole("About to outputLog");
                outputLog();
            });
        });
    });
}