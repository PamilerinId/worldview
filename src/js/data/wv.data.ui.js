/*
 * NASA Worldview
 *
 * This code was originally developed at NASA/Goddard Space Flight Center for
 * the Earth Science Data and Information System (ESDIS) project.
 *
 * Copyright (C) 2013 - 2014 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 */

var wv = wv || {};
wv.data = wv.data || {};

wv.data.ui = wv.data.ui || function(models, config, maps) {

    var HTML_WIDGET_INACTIVE = "<img src='images/camera.png'></img>";
    var HTML_WIDGET_ACTIVE = "<img src='images/cameraon.png'></img>";

    var queryActive = false;
    var list = null;
    var model = models.data;
    var mapController = null;
    var selectionListPanel = null;
    var downloadListPanel = null;
    var lastResults = null;

    var self = {};
    self.selector = "#DataDownload";
    self.id = "DataDownload";

    var init = function() {
        model.events
            .on("activate", onActivate)
            .on("deactivate", onDeactivate)
            .on("productSelect", onProductSelect)
            .on("layerUpdate", onLayerUpdate)
            .on("query", onQuery)
            .on("queryResults", onQueryResults)
            .on("queryCancel", onQueryCancel)
            .on("queryError", onQueryError)
            .on("queryTimeout", onQueryTimeout)
            .on("granuleSelect", updateSelection)
            .on("granuleUnselect", updateSelection);

        REGISTRY.register(self.id, self);
        REGISTRY.markComponentReady(self.id);
        self.updateComponent();

        $(window).resize(resize);
    };

    self.updateComponent = function(queryString) {
        /*
        try {
            model.update(REGISTRY.getState());
        } catch ( error ) {
            Worldview.error("Internal error", error);
        }
        */
    };

    self.getValue = function() {
        if ( model.active ) {
            return "dataDownload=" + model.selectedProduct;
        } else {
            return "";
        }
    };

    self.setValue = function(value) {
        throw new Error("Unsupported: setValue");
    };

    self.loadFromQuery = function(queryString) {
        /*
        var query = Worldview.queryStringToObject(queryString);
        if ( query.dataDownload ) {
            try {
                var state = REGISTRY.getState(queryString);
                model.activate(query.dataDownload);
            } catch ( error ) {
                console.warn("Invalid data download parameter: " + error);
                model.activate();
            }
        }
        */
    };

    self.render = function() {
        var $container = $(self.selector).empty()
            .addClass(self.id + "list")
            .addClass("bank");
        var $actionButton = $("<input></input>")
            .attr("id", "DataDownload_Button")
            .addClass("action")
            .attr("type", "button")
            .attr("value", "")
            .on("click", showDownloadList);

        $container.append($actionButton);

        var $list = $("<div></div>")
            .attr("id", self.id + "content")
            .addClass("content");
        $container.append($list);

        self.refresh();
    };

    self.refresh = function() {
        var $content = $(self.selector + "content");
        var api = $content.data("jsp");
        if ( api ) {
            api.destroy();
        }
        $content = $(self.selector + "content").empty();
        var data = model.groupByProducts();
        $.each(data, function(key, value) {
            refreshProduct($content, key, value);
        });

        $('.dl-group[value="__NO_PRODUCT"] h3 span').click(function(e){
            showUnavailableReason();
        });
        resize();
    };

    var refreshProduct = function($content, key, value) {
        var title = value.title;
        var $header = $("<h3></h3>")
            .addClass("head")
            .html(title);

        // FIXME: Why is this needed?
        var $productSelector;
        if ( !value.notSelectable ) {
            var $selectedCount = $("<i></i>")
                .attr("id", key + "dynamictext")
                .addClass("dynamic")
                .html("0 selected");
            $productSelector = $("<input type='radio'></input>")
                .attr("value", key)
                .attr("data-product", key);

            $header.prepend($productSelector).append($selectedCount);
        }
        if ( model.selectedProduct === key ) {
            $productSelector.each(function() {
                this.checked = true;
            });
        }
        var $contentDlGroup = $("<div class='dl-group'></div>")
            .attr("value", key)
            .attr("data-product", key)
            .click(function() {
                model.selectProduct($(this).find("input").attr("data-product"));
                $(".dl-group").removeClass("dl-group-selected");
                $(this).addClass('dl-group-selected');
                $(".dl-group input").each(function(){
                    this.checked = false;
                });
                $(this).find("input").each(function(){
                    this.checked = true;
                });
            })
            .append($header);

        $content.append($contentDlGroup);

        var $products = $("<ul></ul>")
            .attr("id", self.id + key)
            .addClass(self.id + "category");

        $.each(value.items, function(index, item) {
            refreshLayers($products, key, value, item);
        });
        $contentDlGroup.append($products);
    };

    var refreshLayers = function($container, key, value, layer) {
        var $item = $("<li></li>")
            .attr("id", self.id + key + Worldview.id(layer.value))
            .addClass("item")
            .addClass("item-static");
        $item.append("<h4>" + layer.label + "</h4>");
        $item.append("<p>" + layer.sublabel + "</p>");
        $container.append($item);
    };

   var resize = function() {
        var tabs_height = $(".ui-tabs-nav").outerHeight(true);
        var button_height = $(self.selector + "_Button").outerHeight(true);
        $(self.selector).height(
            $(self.selector).parent().outerHeight() - tabs_height - button_height
        );

        var $pane = $(self.selector + "content");
        var api = $pane.data("jsp");
        if ( $(window).width() > Worldview.TRANSITION_WIDTH ) {
            if ( api ) {
                api.reinitialise();
            } else {
                $pane.jScrollPane({verticalGutter:0, contentWidth:238, autoReinitialise:false});
            }
        } else {
            if ( api ) {
                api.destroy();
            }
        }
   };

    self.onViewChange = function(map) {
        if ( !model.active || queryActive || !lastResults ) {
            return;
        }
        if ( lastResults.granules.length === 0 ) {
            return;
        }
        var hasCentroids = false;
        var inView = false;
        var extent = map.getExtent().toGeometry();
        $.each(lastResults.granules, function(index, granule) {
            if ( granule.centroid && granule.centroid[map.projection] ) {
                hasCentroids = true;
                if ( extent.intersects(granule.centroid[map.projection]) ) {
                    inView = true;
                    return true;
                }
            }
        });
        if ( hasCentroids && !inView ) {
            wv.ui.indicator.show("Zoom out or move map");
        } else {
            wv.ui.indicator.hide();
        }
    };

    var toggleMode = function() {
        model.toggleMode();
    };

    var onActivate = function() {
        if ( !mapController ) {
            mapController =
                Worldview.DataDownload.MapController(model, maps, config);
        }
        onLayerUpdate();
        updateSelection();
    };

    var onDeactivate = function() {
        wv.ui.indicator.hide();
        if ( selectionListPanel ) {
            selectionListPanel.hide();
        }
        if ( downloadListPanel ) {
            downloadListPanel.hide();
        }
    };

    var onProductSelect = function(product) {
        $(self.selector + " input[value='" + product + "']")
            .prop("checked", "true");
    };

    var onLayerUpdate = function() {
        if ( !model.active ) {
            return;
        }
        self.refresh();
    };

    var onQuery = function() {
        queryActive = true;
        wv.ui.indicator.searching();
        if ( selectionListPanel ) {
            selectionListPanel.hide();
        }
        if ( downloadListPanel ) {
            downloadListPanel.hide();
        }
    };

    var onQueryResults = function(results) {
        queryActive = false;
        lastResults = results;
        wv.ui.indicator.hide();
        if ( model.selectedProduct !== null && results.granules.length === 0 ) {
            wv.ui.indicator.noData();
        } else {
            if ( results.meta.showList ) {
                selectionListPanel =
                        Worldview.DataDownload.SelectionListPanel(model, results);
                selectionListPanel.show();
            } else {
                if ( selectionListPanel ) {
                    selectionListPanel.hide();
                }
                selectionListPanel = null;
            }
        }
    };

    var onQueryCancel = function() {
        queryActive = false;
        wv.ui.indicator.hide();
    };

    var onQueryError = function(status, error) {
        queryActive = false;
        wv.ui.indicator.hide();
        if ( status !== "abort" ) {
            console.error("Unable to search", status, error);
            wv.ui.notify("Unable to search at this time. Please try " +
                    "again later");
        }
    };

    var onQueryTimeout = function() {
        queryActive = false;
        wv.ui.indicator.hide();
        wv.ui.notify(
            "No results received yet. This may be due to a " +
            "connectivity issue. Please try again later."
        );
    };

    var updateSelection = function() {
        $button = $("#DataDownload_Button");
        var selected = Worldview.size(model.selectedGranules);
        if ( selected > 0 ) {
            $button.removeAttr("disabled");
            var totalSize = model.getSelectionSize();
            if ( totalSize ) {
                var formattedSize = Math.round(totalSize * 100) / 100;
                $button.val("Download Data (" + formattedSize + " MB)");
            } else {
                $button.val("Download Selected Data");
            }
        } else {
            $button.attr("disabled", "disabled").val("No Data Selected");
        }

        var counts = model.getSelectionCounts();
        $.each(counts, function(productId, count) {
            $("#" + productId + "dynamictext").html("" + count + " selected");
        });
        if ( downloadListPanel && downloadListPanel.visible() ) {
            downloadListPanel.show();
        }

    };

    var showDownloadList = function() {
        if ( selectionListPanel ) {
            selectionListPanel.setVisible(false);
        }
        if ( !downloadListPanel ) {
            downloadListPanel =
                    Worldview.DataDownload.DownloadListPanel(config, model);
            downloadListPanel.events.on("close", function() {
                if ( selectionListPanel ) {
                    selectionListPanel.setVisible(true);
                }
            });
        }
        downloadListPanel.show();
    };

    var updatePreference = function(event, ui) {
        model.setPreference(event.target.value);
    };

    var showUnavailableReason = function() {
        var o;
        bodyMsg = 'Some layers in Worldview do not have corresponding source data products available for download.  These include National Boundaries, Orbit Tracks, Earth at Night, and MODIS Corrected Reflectance products.<br><br>For a downloadable product similar to MODIS Corrected Reflectance, please try the MODIS Land Surface Reflectance layers available in Worldview.  If you would like to generate MODIS Corrected Reflectance imagery yourself, please see the following document: <a href="https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf" target="_blank">https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf</a><br><br>If you would like to download only an image, please use the "camera" icon in the upper right.';
        o = new YAHOO.widget.Panel("WVerror", {
            width: "600px",
            zIndex: 1020,
            visible: false,
            constraintoviewport: true
        });
        title = "Notice";
        o.setHeader('<b>Why are these layers not available for downloading?</b>');
        o.setBody(bodyMsg);
        o.render(document.body);
        o.show();
        o.center();
        o.hideEvent.subscribe(function(i) {
            setTimeout(function() {o.destroy();}, 25);
        });
    };

    init();
    return self;

};
