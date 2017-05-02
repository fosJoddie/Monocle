var _last_pokemon_id = 0;
var _pokemon_count = 251;
var _WorkerIconUrl = 'static/monocle-icons/assets/ball.png';
var _PokestopIconUrl = 'static/monocle-icons/assets/stop.png';

var PokemonIcon = L.Icon.extend({
    options: {
        popupAnchor: [0, -15]
    },
    createIcon: function() {
        let div = document.createElement('div');
        div.innerHTML =
            '<div class="pokemarker">' +
              '<div class="pokeimg">' +
                   '<img class="leaflet-marker-icon" src="' + this.options.iconUrl + '" />' +
              '</div>' +
              '<div class="remaining_text" data-expire="' + this.options.expires_at + '">' + calculateRemainingTime(this.options.expires_at) + '</div>' +
            '</div>';
        return div;
    }
});

var FortIcon = L.Icon.extend({
    options: {
        iconSize: [40, 40],
        popupAnchor: [0, -10],
        className: 'fort-icon'
    }
});
var WorkerIcon = L.Icon.extend({
    options: {
        iconSize: [20, 20],
        className: 'worker-icon',
        iconUrl: _WorkerIconUrl
    }
});
var PokestopIcon = L.Icon.extend({
    options: {
        iconSize: [10, 20],
        className: 'pokestop-icon',
        iconUrl: _PokestopIconUrl
    }
});

var markers = {};
var overlays = {
    Gyms: L.layerGroup([]),
    Pokestops: L.layerGroup([])
};

function unsetHidden (event) {
    event.target.hidden = false;
}

function setHidden (event) {
    event.target.hidden = true;
}

function monitor (group, initial) {
    group.hidden = initial;
    group.on('add', unsetHidden);
    group.on('remove', setHidden);
}

monitor(overlays.Gyms, true)

function getPopupContent (item) {
    let diff = (item.expires_at - new Date().getTime() / 1000);
    let minutes = parseInt(diff / 60);
    let seconds = parseInt(diff - (minutes * 60));
    let expires_at = minutes + 'm ' + seconds + 's';
    let content = '<b>' + item.name + '</b> - <a href="https://pokemongo.gamepress.gg/pokemon/' + item.pokemon_id + '">#' + item.pokemon_id + '</a>';
    if(item.atk != undefined){
        let totaliv = 100 * (item.atk + item.def + item.sta) / 45;
        content += ' - <b>' + totaliv.toFixed(2) + '%</b><br>';
        content += 'Disappears in: ' + expires_at + '<br>';
        content += 'Move 1: ' + item.move1 + ' ( ' + item.damage1 + ' dps )<br>';
        content += 'Move 2: ' + item.move2 + ' ( ' + item.damage2 + ' dps )<br>';
        content += 'IV: ' + item.atk + ' atk, ' + item.def + ' def, ' + item.sta + ' sta<br>';
        content += 'CP: ' + item.cp + ' (Level 30+)<br>';
    } else {
        content += '<br>Disappears in: ' + expires_at + '<br>';
    }
    content += '<a href="#" data-pokeid="'+item.pokemon_id+'" data-newlayer="Hidden" class="popup_filter_link">Hide</a>';
    content += '&nbsp; | &nbsp;';

    let userPref = getPreference('filter-'+item.pokemon_id);
    if (userPref == 'trash'){
        content += '<a href="#" data-pokeid="'+item.pokemon_id+'" data-newlayer="Pokemon" class="popup_filter_link">Move to Pokemon</a>';
    }else{
        content += '<a href="#" data-pokeid="'+item.pokemon_id+'" data-newlayer="Trash" class="popup_filter_link">Move to Trash</a>';
    }
    content += '<br>=&gt; <a href="https://www.google.com/maps/?daddr='+ item.lat + ','+ item.lon +'" target="_blank" title="See in Google Maps">Get directions</a>';
    return content;
}

function getOpacity (diff) {
    if (diff > 300 || getPreference('FIXED_OPACITY') === "1") {
        return 1;
    }
    return 0.5 + diff / 600;
}

function PokemonMarker (raw) {
    let icon = new PokemonIcon({iconUrl: '/static/monocle-icons/icons/' + raw.pokemon_id + '.png', expires_at: raw.expires_at});
    let marker = L.marker([raw.lat, raw.lon], {icon: icon, opacity: 1});

    let intId = parseInt(raw.id.split('-')[1]);
    if (_last_pokemon_id < intId){
        _last_pokemon_id = intId;
    }

    if (raw.trash) {
        marker.overlay = 'Trash';
    } else {
        marker.overlay = 'Pokemon';
    }
    let userPreference = getPreference('filter-'+raw.pokemon_id);
    if (userPreference === 'pokemon'){
        marker.overlay = 'Pokemon';
    }else if (userPreference === 'trash'){
        marker.overlay = 'Trash';
    }else if (userPreference === 'hidden'){
        marker.overlay = 'Hidden';
    }
    marker.raw = raw;
    markers[raw.id] = marker;
    marker.on('popupopen',function popupopen (event) {
        event.popup.options.autoPan = true; // Pan into view once
        event.popup.setContent(getPopupContent(event.target.raw));
        event.target.popupInterval = setInterval(function () {
            event.popup.setContent(getPopupContent(event.target.raw));
            event.popup.options.autoPan = false; // Don't fight user panning
        }, 1000);
    });
    marker.on('popupclose', function (event) {
        clearInterval(event.target.popupInterval);
    });
    marker.setOpacity(getOpacity(marker.raw));
    marker.opacityInterval = setInterval(function () {
        if (marker.overlay === "Hidden" || overlays[marker.overlay].hidden) {
            return;
        }
        let diff = marker.raw.expires_at - new Date().getTime() / 1000;
        if (diff > 0) {
            marker.setOpacity(getOpacity(diff));
        } else {
            marker.removeFrom(overlays[marker.overlay]);
            markers[marker.raw.id] = undefined;
            clearInterval(marker.opacityInterval);
        }
    }, 2500);
    marker.bindPopup();
    return marker;
}

function GymLevel(gymPoints) {
    const gymPrestiges = [2000, 4000, 8000, 12000, 16000, 20000, 30000, 40000, 50000];
    let gymLevel = 1;
    while (gymPoints >= gymPrestiges[gymLevel - 1]) {
        gymLevel++;
    }
    return gymLevel;
}

function FortMarker (raw) {
    let icon = new FortIcon({iconUrl: '/static/img/forts/' + raw.team + '_' + GymLevel(raw.prestige) + '.png'});
    let marker = L.marker([raw.lat, raw.lon], {icon: icon, opacity: 1});
    marker.raw = raw;
    markers[raw.id] = marker;
    marker.on('popupopen',function popupopen (event) {
        let content = ''
        if (raw.team === 0) {
            content = '<b>An empty Gym!</b>'
        }
        else {
            if (raw.team === 1 ) {
                content = '<b>Team Mystic</b>'
            }
            else if (raw.team === 2 ) {
                content = '<b>Team Valor</b>'
            }
            else if (raw.team === 3 ) {
                content = '<b>Team Instinct</b>'
            }
            content += '<br>Prestige: ' + raw.prestige +
                       '<br>Guarding Pokemon: ' + raw.pokemon_name + ' (#' + raw.pokemon_id + ')';
        }
        content += '<br>=&gt; <a href=https://www.google.com/maps/?daddr='+ raw.lat + ','+ raw.lon +' target="_blank" title="See in Google Maps">Get directions</a>';
        event.popup.setContent(content);
    });
    marker.bindPopup();
    return marker;
}

function WorkerMarker (raw) {
    let icon = new WorkerIcon();
    let marker = L.marker([raw.lat, raw.lon], {icon: icon});
    let circle = L.circle([raw.lat, raw.lon], 70, {weight: 2});
    let group = L.featureGroup([marker, circle])
        .bindPopup('<b>Worker ' + raw.worker_no + '</b><br>time: ' + raw.time + '<br>speed: ' + raw.speed + '<br>total seen: ' + raw.total_seen + '<br>visits: ' + raw.visits + '<br>seen here: ' + raw.seen_here);
    return group;
}

function addPokemonToMap (data, map) {
    data.forEach(function (item) {
        // Already placed? No need to do anything, then
        if (item.id in markers) {
            return;
        }
        let marker = PokemonMarker(item);
        if (marker.overlay !== "Hidden"){
            marker.addTo(overlays[marker.overlay])
        }
    });
    updateTime();
    if (_updateTimeInterval === null){
        _updateTimeInterval = setInterval(updateTime, 1000);
    }
}

function addGymsToMap (data, map) {
    data.forEach(function (item) {
        // No change since last time? Then don't do anything
        let existing = markers[item.id];
        if (typeof existing !== 'undefined') {
            if (existing.raw.sighting_id === item.sighting_id) {
                return;
            }
            existing.removeFrom(overlays.Gyms);
            markers[item.id] = undefined;
        }
        marker = FortMarker(item);
        marker.addTo(overlays.Gyms);
    });
}

function addSpawnsToMap (data, map) {
    data.forEach(function (item) {
        let circle = L.circle([item.lat, item.lon], 5, {weight: 2});
        let time = '??';
        if (item.despawn_time != null) {
            time = '' + Math.floor(item.despawn_time/60) + 'min ' +
                   (item.despawn_time%60) + 'sec';
        }
        else {
            circle.setStyle({color: '#f03'})
        }
        circle.bindPopup('<b>Spawn ' + item.spawn_id + '</b>' +
                         '<br/>despawn: ' + time +
                         '<br/>duration: '+ (item.duration == null ? '30mn' : item.duration + 'mn') +
                         '<br>=&gt; <a href=https://www.google.com/maps/?daddr='+ item.lat + ','+ item.lon +' target="_blank" title="See in Google Maps">Get directions</a>');
        circle.addTo(overlays.Spawns);
    });
}

function addPokestopsToMap (data, map) {
    data.forEach(function (item) {
        let icon = new PokestopIcon();
        let marker = L.marker([item.lat, item.lon], {icon: icon});
        marker.raw = item;
        marker.bindPopup('<b>Pokestop: ' + item.external_id + '</b>' +
                         '<br>=&gt; <a href=https://www.google.com/maps/?daddr='+ item.lat + ','+ item.lon +' target="_blank" title="See in Google Maps">Get directions</a>');
        marker.addTo(overlays.Pokestops);
    });
}

function addScanAreaToMap (data, map) {
    data.forEach(function (item) {
        if (item.type === 'scanarea'){
            L.polyline(item.coords).addTo(overlays.ScanArea);
        } else if (item.type === 'scanblacklist'){
            L.polyline(item.coords, {'color':'red'}).addTo(overlays.ScanArea);
        }
    });
}

function addWorkersToMap (data, map) {
    overlays.Workers.clearLayers()
    data.forEach(function (item) {
        marker = WorkerMarker(item);
        marker.addTo(overlays.Workers);
    });
}

function getPokemon () {
    if (overlays.Pokemon.hidden && overlays.Trash.hidden) {
        return;
    }
    new Promise(function (resolve, reject) {
        $.get('/data?last_id='+_last_pokemon_id, function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addPokemonToMap(data, map);
    });
}

function getGyms () {
    if (overlays.Gyms.hidden) {
        return;
    }
    new Promise(function (resolve, reject) {
        $.get('/gym_data', function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addGymsToMap(data, map);
    });
}

function getSpawnPoints() {
    new Promise(function (resolve, reject) {
        $.get('/spawnpoints', function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addSpawnsToMap(data, map);
    });
}

function getPokestops() {
    new Promise(function (resolve, reject) {
        $.get('/pokestops', function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addPokestopsToMap(data, map);
    });
}

function getScanAreaCoords() {
    new Promise(function (resolve, reject) {
        $.get('/scan_coords', function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addScanAreaToMap(data, map);
    });
}

function getWorkers() {
    if (overlays.Workers.hidden) {
        return;
    }
    new Promise(function (resolve, reject) {
        $.get('/workers_data', function (response) {
            resolve(response);
        });
    }).then(function (data) {
        addWorkersToMap(data, map);
    });
}

var map = L.map('main-map', {preferCanvas: true}).setView(_MapCoords, 13);

overlays.Gyms.addTo(map);

var control = L.control.layers(null, overlays).addTo(map);
L.tileLayer(_MapProviderUrl, {
    opacity: 0.75,
    attribution: _MapProviderAttribution
}).addTo(map);
map.whenReady(function () {
    $('.my-location').on('click', function () {
        map.locate({ enableHighAccurracy: true, setView: true });
    });

    getGyms();

    overlays.Pokestops.once('add', function(e) {
        getPokestops();
    });
    setInterval(getGyms, 110000)
});

$("#settings>ul.nav>li>a").on('click', function(){
    // Click handler for each tab button.
    $(this).parent().parent().children("li").removeClass('active');
    $(this).parent().addClass('active');
    let panel = $(this).data('panel');
    let item = $("#settings>.settings-panel").removeClass('active')
        .filter("[data-panel='"+panel+"']").addClass('active');
});

$("#settings_close_btn").on('click', function(){
    // 'X' button on Settings panel
    $("#settings").animate({
        opacity: 0
    }, 250, function(){ $(this).hide(); });
});

$('.my-settings').on('click', function () {
    // Settings button on bottom-left corner
    $("#settings").show().animate({
        opacity: 1
    }, 250);
});

$('#reset_btn').on('click', function () {
    // Reset button in Settings>More
    if (confirm("This will reset all your preferences. Are you sure?")){
        localStorage.clear();
        location.reload();
    }
});

$('body').on('click', '.popup_filter_link', function () {
    let id = $(this).data("pokeid");
    let layer = $(this).data("newlayer").toLowerCase();
    moveToLayer(id, layer);
    let item = $("#settings button[data-id='"+id+"']");
    item.removeClass("active").filter("[data-value='"+layer+"']").addClass("active");
});

$('#settings').on('click', '.settings-panel button', function () {
    //Handler for each button in every settings-panel.
    let item = $(this);
    if (item.hasClass('active')){
        return;
    }
    let id = item.data('id');
    let key = item.parent().data('group');
    let value = item.data('value');

    item.parent().children("button").removeClass("active");
    item.addClass("active");

    if (key.indexOf('filter-') > -1){
        // This is a pokemon's filter button
        moveToLayer(id, value);
    }else{
        setPreference(key, value);
    }
});

function moveToLayer(id, layer){
    setPreference("filter-"+id, layer);
    layer = layer.toLowerCase();
    for(let k in markers) {
        let m = markers[k];
        if ((k.indexOf("pokemon-") > -1) && (m !== undefined) && (m.raw.pokemon_id === id)){
            m.removeFrom(overlays[m.overlay]);
            if (layer === 'pokemon'){
                m.overlay = "Pokemon";
                m.addTo(overlays.Pokemon);
            }else if (layer === 'trash') {
                m.overlay = "Trash";
                m.addTo(overlays.Trash);
            }
        }
    }
}

function populateSettingsPanels(){
    let container = $('.settings-panel[data-panel="filters"]').children('.panel-body');
    let newHtml = '';
    for (let i = 1; i <= _pokemon_count; i++){
        let partHtml = `<div class="text-center">
                <img src="static/monocle-icons/icons/`+i+`.png">
                <div class="btn-group" role="group" data-group="filter-`+i+`">
                  <button type="button" class="btn btn-default" data-id="`+i+`" data-value="pokemon">Pokémon</button>
                  <button type="button" class="btn btn-default" data-id="`+i+`" data-value="trash">Trash</button>
                  <button type="button" class="btn btn-default" data-id="`+i+`" data-value="hidden">Hide</button>
                </div>
            </div>
        `;

        newHtml += partHtml
    }
    newHtml += '</div>';
    container.html(newHtml);
}

function setSettingsDefaults(){
    for (let i = 1; i <= _pokemon_count; i++){
        _defaultSettings['filter-'+i] = (_defaultSettings['TRASH_IDS'].indexOf(i) > -1) ? "trash" : "pokemon";
    };

    $("#settings div.btn-group").each(function(){
        let item = $(this);
        let key = item.data('group');
        let value = getPreference(key);
        if (value === false)
            value = "0";
        else if (value === true)
            value = "1";
        item.children("button").removeClass("active").filter("[data-value='"+value+"']").addClass("active");
    });
}
populateSettingsPanels();
setSettingsDefaults();

function getPreference(key, ret){
    return localStorage.getItem(key) ? localStorage.getItem(key) : (key in _defaultSettings ? _defaultSettings[key] : ret);
}

function setPreference(key, val){
    localStorage.setItem(key, val);
}

$(window).scroll(function () {
    if ($(this).scrollTop() > 100) {
        $('.scroll-up').fadeIn();
    } else {
        $('.scroll-up').fadeOut();
    }
});

$("#settings").scroll(function () {
    if ($(this).scrollTop() > 100) {
        $('.scroll-up').fadeIn();
    } else {
        $('.scroll-up').fadeOut();
    }
});

$('.scroll-up').click(function () {
    $("html, body, #settings").animate({
        scrollTop: 0
    }, 500);
    return false;
});

function calculateRemainingTime(expire_at_timestamp) {
    let diff = (expire_at_timestamp - new Date().getTime() / 1000);
    let minutes = parseInt(diff / 60);
    let seconds = parseInt(diff - (minutes * 60));
    return minutes + ':' + (seconds > 9 ? "" + seconds: "0" + seconds);
}

function updateTime() {
    if (getPreference("SHOW_TIMER") === "1"){
        $(".remaining_text").each(function() {
            $(this).css('visibility', 'visible');
            this.innerHTML = calculateRemainingTime($(this).data('expire'));
        });
    }else{
        $(".remaining_text").each(function() {
            $(this).css('visibility', 'hidden');
        });
    }
}
