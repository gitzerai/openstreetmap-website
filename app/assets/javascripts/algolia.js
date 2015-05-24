window.MyAlgolia = new MyAlgolia() || {};

function MyAlgolia() {

    var defaultMinLength = 2;
    var defaultLimit = 5;
    var defaultShowHighlighted = true;
    var defaultCssClass = 'myalgolia';

    var table = '';
    var languageTable = '';

    var $field;
    var $resultsWrapper;

    var config;
    var algoliaClient;

    var isSearchInProgress = false;
    var resultsWrapperSelector = '.myalgolia > div.query-results';
    var lastResultsCount = -1;

    var resizeResultsWrapper = function() {
        var cssWidth = $field.css('width');
        $resultsWrapper.css('width', cssWidth);
    }

    var initResultsWrapper = function() {
        $('.' + defaultCssClass).append("<div class='query-results'></div>");
        $resultsWrapper = $(resultsWrapperSelector);
        $(this).on('resize', resizeResultsWrapper);
        resizeResultsWrapper();
    }

    this.init = function(userConfig) {

        if (window.algoliasearch === undefined || userConfig.app_id === undefined || userConfig.api_key === undefined) {
            log('MyAlgolia: Algolia could not be initialized.', 'error');
            return;
        }

        algoliaClient = window.algoliasearch(userConfig.app_id, userConfig.api_key);

        config = userConfig;
        if (config.minLength === undefined) {
            config.minLength = defaultMinLength;
        }
        if (config.limit === undefined) {
            config.limit = defaultLimit;
        }
        if (config.showHighlighted === undefined) {
            config.showHighlighted = defaultShowHighlighted;
        }
        if (config.language === undefined) {
            config.language = 'en';
        }
        if (config.attributes !== undefined && config.attributes['name:' + config.language] === undefined) {
            config.attributes.push('name:' + config.language)
        }

        table = config.table;
        languageTable = table + '_' + config.language

        $field = $(config.field);

        if ($field.length == 0) {
            log('MyAlgolia: Field not found.', 'error');
            return;
        }
        else {
            log('MyAlgolia: Initiated on ' + config.field);
        }

        $field.wrap("<div class='" + defaultCssClass + "'></div>");
        $field.attr("autocomplete", "off");

        initResultsWrapper();

        $field.on('keyup', function() {
            MyAlgolia.performSearch($(this).val());
        });

        if (config.afterInit) {
            config.afterInit();
        }
    }

    this.performSearch = function(query) {
        if (query.length < config.minLength || isSearchInProgress) {
            log('Too short or search already in progress');
            return;
        }
        addSpinner();
        isSearchInProgress = true;

        log("Starting performing search: " + query);

        var jsonQuery = [{
            indexName: languageTable === undefined ? table : languageTable,
            query: query,
            params: {
              hitsPerPage: config.limit
            }
        }];

        if (config.attributes) {
            jsonQuery[0].params.attributesToRetrieve = config.attributes;
            jsonQuery[0].params.attributesToHighlight = config.attributes;
        }

        if (config.location) {
            jsonQuery[0].params.aroundLatLng = config.location.lat + "," + config.location.lng
        }

        if (config.around_view_center_location === true) {
            var map = window.OSMMap,
                center = map.getCenter().wrap(),
                precision = OSM.zoomPrecision(map.getZoom());

            jsonQuery[0].params.aroundLatLng = center.lat.toFixed(precision) + "," + center.lng.toFixed(precision);
        }
        else if (config.around_ip_location === true) {
            jsonQuery[0].params.aroundLatLngViaIP = true;
        }

        algoliaClient.search(jsonQuery, searchCallback);
    }

    var addSpinner = function() {
        $field.addClass('spinner');
    }

    var removeSpinner = function() {
        $field.removeClass('spinner');
    }

    var clearResults = function() {
        $resultsWrapper.empty();
    }

    var searchCallback = function(err, content) {
        resultsCount = 0;
        if (err) {
            log('Algolia Callback Error: ' + err.message, 'error');
            lastResultsCount = -1;
            if (config.onError) {
                config.onError();
            }
        }
        else {
            clearResults();
            content.results.forEach(function(result) {
                result.hits.forEach(function(hit) {
                    resultsCount++;
                    addSearchResult(hit);
                });
            });

            if (resultsCount == 0) {
                addNoResults();
            }
            $resultsWrapper.addClass("show");
            if (config.onSuccess) {
                config.onSuccess();
            }
        }
        if (lastResultsCount !== resultsCount) {
            slideResultsWrapper();
        }
        lastResultsCount = resultsCount;
        removeSpinner();
        isSearchInProgress = false;
    }

    var slideResultsWrapper = function() {
        var el = $resultsWrapper,
            curHeight = el.height(),
            autoHeight = el.css('height', 'auto').height();
        el.height(curHeight).animate({height: autoHeight}, 250);
    }

    var addNoResults = function() {
        var $div = $("<div class='no-results'></div>");
        $div.append("<i class='fa fa-frown-o'></i>");
        $div.append("No results...");

        $resultsWrapper.append($div);
    }

    var addSearchResult = function(result) {
        log("MyAlgolia: Result Object: ");
        log(result);

        var text = '',
            isHighlighted = config.showHighlighted,
            fieldBaseName = 'name',
            fieldLanguageName = fieldBaseName + ':' + config.language;

        if (isHighlighted) {
            var field = result._highlightResult[fieldLanguageName] || result._highlightResult[fieldBaseName];
            text = field.value;
        }
        else {
            text = result[fieldLanguageName] || result[fieldBaseName];
        }

        var $div = $("<div class='result'></div>"),
            $a = $("<a href='/" + result.type + "/" + result.id + "'></a"),
            icon = getIcon(result.type);

        if (icon !== null && icon !== undefined) {
            $a.append("<i class='fa fa-" + icon + "-o'></i>");
        }

        $a.append("<span class='name'>" + text + "</span>");

        if (result.tags !== undefined) {
            resultLocation = '';
            if (result.tags.is_in !== undefined) {
                resultLocation = result.tags.is_in;
            }
            else if (result.tags['is_in:country'] !== undefined) {
                resultLocation = result.tags['is_in:country'];
            }

            if (resultLocation.length > 0) {
                $a.append("<span class='location'>" + resultLocation + "</span>")
            }
        }
        $div.append($a);
        $resultsWrapper.append($div);
    }

    var getIcon = function (key) {
        if (config.typeToIconMap === undefined) {
            return undefined;
        }
        return config.typeToIconMap[key];
    }

    var log = function(message, type) {
        if (type === 'error') {
            console.error(message);
        }
        else {
          console.log(message);
        }
    }
}

$(document).ready(function () {

    MyAlgolia.init({
      "app_id": "TWP91M9DQ7",
      "api_key": "103ec86992774c0e322cc25ffd339ffb",
      "field": "#sidebar #query",
      "typeToIconMap": {"node": "building"},
      "minLength": 2,
      "table": "osm_cities",
      "language": "en",
      "attributes": ["type", "id", "name", "_geoloc", "tags"]
    });

});
