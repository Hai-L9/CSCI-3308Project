
window.TaskMap = (() => {
  let apiKey = null;

  async function fetchApiKey() {
    if (apiKey !== null) return apiKey;
    const res = await fetch('/api/config');
    apiKey = (await res.json()).googleMapsKey || '';
    return apiKey;
  }

  function loadMapsScript(key) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) { resolve(); return; }
      window.__googleMapsReady = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=maps,marker,places&loading=async&callback=__googleMapsReady`;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadGoogleMaps() {
    const key = await fetchApiKey();
    if (!key) {
      console.warn('no maps API key configured');
      return false;
    }
    await loadMapsScript(key);
    return true;
  }

  function create({ mapElId, searchContainerId, pinBtnId, clearBtnId, labelId, hintId }) {
    let map = null;
    let marker = null;
    let selection = null;
    let pinModeActive = false;

    const get = (id) => document.getElementById(id);
    const updateLabel = (text) => { get(labelId).textContent = text; };
    const setHint = (html) => { get(hintId).innerHTML = html; };
    const setClearVisible = (v) => { get(clearBtnId).classList.toggle('d-none', !v); };

    function placeMarker(lat, lng, label) {
      const pos = { lat, lng };
      if (marker) {
        marker.position = pos;
      } else {
        marker = new AdvancedMarkerElement({ map, position: pos });
      }
      map.panTo(pos);
      selection = { lat, lng, name: label, address: label };
      updateLabel(`📍 ${label}`);
      setClearVisible(true);
      setHint('Location set. Click Clear to remove it.');
    }

    function clearLocation() {
      selection = null;
      updateLabel('');
      setClearVisible(false);
      setHint('Search above or click Drop a Pin then click the map to set a location.');
      if (marker) { marker.map = null; marker = null; }
      const input = get(searchContainerId)?.querySelector('input, gmp-place-autocomplete');
      if (input) input.value = '';
    }

    function setPinMode(active) {
      pinModeActive = active;
      get(pinBtnId).classList.toggle('active', active);
      if (active) {
        setHint('Click anywhere on the map to place a pin.');
      } else if (!selection) {
        setHint('Search above or click Drop a Pin then click the map to set a location.');
      }
    }

    let AdvancedMarkerElement;

    async function initMap() {
      const { Map } = await google.maps.importLibrary('maps');
      ({ AdvancedMarkerElement } = await google.maps.importLibrary('marker'));

      map = new Map(get(mapElId), {
        center: { lat: 40, lng: -105 }, // Boulder
        zoom: 12,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true,
      });

      map.addListener('click', (e) => {
        if (!pinModeActive) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        placeMarker(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      });

      get(pinBtnId).addEventListener('click', () => setPinMode(!pinModeActive));
      get(clearBtnId).addEventListener('click', () => { clearLocation(); setPinMode(false); });
    }

    async function initPlaces() {
      try {
        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
        const autocomplete = new PlaceAutocompleteElement();
        autocomplete.setAttribute('placeholder', 'Search for a location…');
        autocomplete.className = 'form-control form-control-sm';
        // Center search results around boulder
        autocomplete.locationBias = { lat: 40, lng: -105 };
        get(searchContainerId).appendChild(autocomplete);

        autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
          const place = placePrediction.toPlace();
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
          if (!place.location) return;
          setPinMode(false);
          placeMarker(place.location.lat(), place.location.lng(), place.formattedAddress || place.displayName);
          map.setZoom(15);
        });
      } catch (err) {
        console.warn('Maps API down', err.message);
      }
    }

    async function init() {
      const loaded = await loadGoogleMaps();
      if (!loaded) return;
      if (!map) {
        await initMap();
        await initPlaces();
      }
      google.maps.event.trigger(map, 'resize');
    }

    function setLocation(lat, lng, label) {
      if (!map) return;
      placeMarker(lat, lng, label);
      map.setZoom(14);
    }

    function getSelection() { return selection; }

    function reset() {
      clearLocation();
      setPinMode(false);
    }

    return { init, getSelection, setLocation, reset };
  }

  return { create, loadGoogleMaps };
})();
