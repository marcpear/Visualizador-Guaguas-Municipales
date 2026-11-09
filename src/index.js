
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ==================================================
// ESCENA, CÁMARA Y RENDERIZADOR
// ==================================================

var escena = new THREE.Scene();
escena.background = new THREE.Color(0x202830);

var camara = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
);

camara.position.set(30, 25, 30);
camara.lookAt(0, 0, 0);

var renderizador = new THREE.WebGLRenderer({ antialias: true });
renderizador.setSize(window.innerWidth, window.innerHeight);
renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderizador.shadowMap.enabled = true;
renderizador.shadowMap.type = THREE.PCFSoftShadowMap;

document.getElementById("contenedor3D").appendChild(renderizador.domElement);

// ==================================================
// ILUMINACIÓN
// ==================================================

escena.add(new THREE.AmbientLight(0xffffff, 1.1));

var luzDireccional = new THREE.DirectionalLight(0xffffff, 1.2);
luzDireccional.position.set(50, 100, 50);
luzDireccional.castShadow = true;
escena.add(luzDireccional);

// ==================================================
// CONTROLES DE CÁMARA
// ==================================================

var controles = new TrackballControls(camara, renderizador.domElement);
controles.rotateSpeed = 3;
controles.zoomSpeed = 1.2;
controles.panSpeed = 0.8;

// ==================================================
// VARIABLES GENERALES
// ==================================================

var nodos = {};
var guaguasAnimadas = [];
var gruposLineas = {};
var coloresLineas = {};
var reloj = new THREE.Clock();

var escala = 0.01;
var latCentro = 0;
var lonCentro = 0;
var factorLongitud = 0;

var coloresIniciales = {
    L1: 0xff3333,
    L2: 0x3388ff,
    L3: 0x22aa66
};

// ==================================================
// CONVERSIÓN DE COORDENADAS
// ==================================================

function mercatorY(latitud) {
    var latRad = latitud * Math.PI / 180;

    return 6378137 * Math.log(
        Math.tan(Math.PI / 4 + latRad / 2)
    );
}

function convertirCoordenadas(lat, lon) {

    var x = (lon - lonCentro) * factorLongitud * escala;

    var yMercator = mercatorY(lat);
    var yCentro = mercatorY(latCentro);

    var z = -(yMercator - yCentro) *
        Math.cos(latCentro * Math.PI / 180) * escala;

    return new THREE.Vector3(x, 0, z);
}

// ==================================================
// COLOR AUTOMÁTICO PARA TODAS LAS LÍNEAS
// ==================================================

function obtenerColorLinea(nombre, indice) {

    if (coloresIniciales[nombre]) {
        return coloresIniciales[nombre];
    }

    var tono = (indice * 137.508) % 360;

    var color = new THREE.Color();
    color.setHSL(tono / 360, 0.8, 0.55);

    return color.getHex();
}

// ==================================================
// MENÚ PARA SELECCIONAR LÍNEAS
// ==================================================

function crearMenuLineas(nombresLineas) {

    var menu = document.createElement("div");

    menu.style.position = "fixed";
    menu.style.top = "15px";
    menu.style.left = "15px";
    menu.style.zIndex = "1000";
    menu.style.padding = "12px";
    menu.style.width = "210px";
    menu.style.background = "rgba(255,255,255,0.95)";
    menu.style.borderRadius = "10px";
    menu.style.boxShadow = "0 2px 12px rgba(0,0,0,0.35)";
    menu.style.fontFamily = "Arial, sans-serif";
    menu.style.color = "#222";

    var titulo = document.createElement("div");
    titulo.textContent = "Líneas de guaguas";
    titulo.style.fontSize = "15px";
    titulo.style.fontWeight = "bold";
    titulo.style.marginBottom = "9px";

    menu.appendChild(titulo);

    var selector = document.createElement("select");

    selector.style.width = "100%";
    selector.style.padding = "8px";
    selector.style.border = "1px solid #bbb";
    selector.style.borderRadius = "6px";
    selector.style.background = "#fff";
    selector.style.fontSize = "13px";
    selector.style.cursor = "pointer";

    var opcionTodas = document.createElement("option");
    opcionTodas.value = "TODAS";
    opcionTodas.textContent = "Todas las líneas";

    selector.appendChild(opcionTodas);

    nombresLineas.forEach(function (nombre) {

        var opcion = document.createElement("option");
        opcion.value = nombre;
        opcion.textContent = "Línea " + nombre;

        selector.appendChild(opcion);
    });

    selector.addEventListener("change", function () {

        var seleccion = selector.value;

        nombresLineas.forEach(function (nombre) {

            gruposLineas[nombre].visible =
                seleccion === "TODAS" || nombre === seleccion;
        });
    });

    menu.appendChild(selector);

    var ayuda = document.createElement("div");

    ayuda.textContent =
        "Selecciona una línea para verla por separado.";

    ayuda.style.fontSize = "11px";
    ayuda.style.color = "#666";
    ayuda.style.marginTop = "8px";
    ayuda.style.lineHeight = "1.4";

    menu.appendChild(ayuda);

    document.body.appendChild(menu);
}

// Carga un mapa como textura, usando los límites geográficos de la imagen.
function cargarMapa(minLon, minLat, maxLon, maxLat) {
    new THREE.TextureLoader().load("/datos/mapa.png", function (textura) {
        textura.colorSpace = THREE.SRGBColorSpace;
        var esquina = convertirCoordenadas(minLat, minLon);
        var ancho = (maxLon - minLon) * factorLongitud * escala;
        var alto = (mercatorY(maxLat) - mercatorY(minLat)) *
            Math.cos(latCentro * Math.PI / 180) * escala;
        var suelo = new THREE.Mesh(
            new THREE.PlaneGeometry(ancho, alto),
            new THREE.MeshBasicMaterial({ map: textura })
        );
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(esquina.x + ancho / 2, -0.03, esquina.z - alto / 2);
        escena.add(suelo);
    });
}
// ==================================================
// CREAR GUAGUA
// ==================================================

function crearGuagua(nombreLinea, puntos) {

    var mayorLongitud = 0;
    var mejorRecorrido = null;

    puntos.forEach(function (recorrido) {

        var longitud = 0;

        for (var i = 0; i < recorrido.length - 1; i++) {
            longitud += recorrido[i].distanceTo(recorrido[i + 1]);
        }

        if (longitud > mayorLongitud) {
            mayorLongitud = longitud;
            mejorRecorrido = recorrido;
        }
    });

    if (!mejorRecorrido || mayorLongitud === 0) {
        return;
    }

    var distancias = [0];
    var longitudTotal = 0;

    for (var i = 0; i < mejorRecorrido.length - 1; i++) {

        longitudTotal += mejorRecorrido[i].distanceTo(
            mejorRecorrido[i + 1]
        );

        distancias.push(longitudTotal);
    }

    var geometriaGuagua = new THREE.BoxGeometry(
        0.45,
        0.20,
        0.90
    );

    var materialGuagua = new THREE.MeshStandardMaterial({
        color: coloresLineas[nombreLinea],
        roughness: 0.6
    });

    var guagua = new THREE.Mesh(
        geometriaGuagua,
        materialGuagua
    );

    guagua.castShadow = true;

    gruposLineas[nombreLinea].add(guagua);

    guaguasAnimadas.push({
        objeto: guagua,
        puntos: mejorRecorrido,
        distancias: distancias,
        longitudTotal: longitudTotal,
        distanciaActual: 0,
        velocidad: 3
    });
}

// ==================================================
// CARGA DEL MAPA OSM
// ==================================================

var cargadorOSM = new THREE.FileLoader();

cargadorOSM.load(
    "/datos/mapa.osm",

    function (contenido) {

        var parser = new DOMParser();

        var documento = parser.parseFromString(
            contenido,
            "text/xml"
        );

        if (documento.querySelector("parsererror")) {
            console.error("Error al interpretar el archivo OSM.");
            return;
        }

        var elementosNodos = documento.getElementsByTagName("node");

        var minLat = Infinity;
        var maxLat = -Infinity;
        var minLon = Infinity;
        var maxLon = -Infinity;

        for (var i = 0; i < elementosNodos.length; i++) {

            var nodo = elementosNodos[i];

            var id = nodo.getAttribute("id");
            var lat = parseFloat(nodo.getAttribute("lat"));
            var lon = parseFloat(nodo.getAttribute("lon"));

            nodos[id] = {
                lat: lat,
                lon: lon
            };

            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
        }

        latCentro = (minLat + maxLat) / 2;
        lonCentro = (minLon + maxLon) / 2;

        factorLongitud =
            111320 * Math.cos(latCentro * Math.PI / 180);

        // Extensión geográfica del PNG descargado de OpenStreetMap.
        var limitesMapa = { minLon: -15.496, maxLon: -15.389, minLat: 28.044, maxLat: 28.176 };
        cargarMapa(limitesMapa.minLon, limitesMapa.minLat, limitesMapa.maxLon, limitesMapa.maxLat);

        // ==================================================
        // CALLES, EDIFICIOS Y ETIQUETAS
        // ==================================================

        var elementosWays = documento.getElementsByTagName("way");

        var verticesCalles = [];
        var geometriaEdificios = [];

        for (var i = 0; i < elementosWays.length; i++) {

            var way = elementosWays[i];
            var etiquetas = way.getElementsByTagName("tag");

            var esEdificio = false;
            var esCarretera = false;

            var altura = 0;
            var niveles = 0;

            for (var j = 0; j < etiquetas.length; j++) {

                var clave = etiquetas[j].getAttribute("k");
                var valor = etiquetas[j].getAttribute("v");

                if (clave === "building") esEdificio = true;
                if (clave === "highway") esCarretera = true;
                if (clave === "height") altura = parseFloat(valor);
                if (clave === "building:levels") niveles = parseFloat(valor);
            }

            var referencias = way.getElementsByTagName("nd");
            var puntos = [];

            for (var j = 0; j < referencias.length; j++) {

                var referencia = referencias[j].getAttribute("ref");
                var coordenadas = nodos[referencia];

                if (coordenadas) {
                    puntos.push(
                        convertirCoordenadas(
                            coordenadas.lat,
                            coordenadas.lon
                        )
                    );
                }
            }

            // Calles.

            if (esCarretera && puntos.length >= 2) {

                for (var j = 0; j < puntos.length - 1; j++) {

                    verticesCalles.push(
                        puntos[j].x, 0.08, puntos[j].z,
                        puntos[j + 1].x, 0.08, puntos[j + 1].z
                    );
                }

            }

            // Edificios 3D.

            if (esEdificio && puntos.length >= 4) {

                var contorno = puntos.map(function (punto) {
                    return new THREE.Vector2(punto.x, -punto.z);
                });

                if (
                    contorno[0].distanceTo(
                        contorno[contorno.length - 1]
                    ) < 0.001
                ) {
                    contorno.pop();
                }

                if (contorno.length < 3) continue;

                var forma = new THREE.Shape(contorno);

                var alturaEdificio = 0;

                if (altura > 0) {
                    alturaEdificio = altura * escala;
                } else if (niveles > 0) {
                    alturaEdificio = niveles * 3 * escala;
                } else {
                    alturaEdificio = 12 * escala;
                }

                alturaEdificio = Math.max(alturaEdificio, 0.15);

                var geometria = new THREE.ExtrudeGeometry(forma, {
                    depth: alturaEdificio,
                    bevelEnabled: false,
                    curveSegments: 1
                });

                geometria.rotateX(-Math.PI / 2);
                geometria.translate(0, 0.02, 0);

                geometriaEdificios.push(geometria);
            }
        }

        // Dibujar calles.

        var geometriaCalles = new THREE.BufferGeometry();

        geometriaCalles.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(verticesCalles, 3)
        );

        var materialCalles = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.65
        });

        escena.add(
            new THREE.LineSegments(
                geometriaCalles,
                materialCalles
            )
        );

        // Dibujar edificios.

        if (geometriaEdificios.length > 0) {

            var geometriaUnida = mergeGeometries(
                geometriaEdificios,
                false
            );

            var materialEdificios = new THREE.MeshStandardMaterial({
                color: 0xd7d2ca,
                roughness: 0.9,
                metalness: 0
            });

            var edificios = new THREE.Mesh(
                geometriaUnida,
                materialEdificios
            );

            edificios.castShadow = true;
            edificios.receiveShadow = true;

            escena.add(edificios);
        }

        geometriaEdificios.forEach(function (geometria) {
            geometria.dispose();
        });

        // ==================================================
        // CARGA DE TODAS LAS LÍNEAS GEOJSON
        // ==================================================

        var cargadorGeoJSON = new THREE.FileLoader();

        cargadorGeoJSON.load(
            "/datos/todas_las_lineas.geojson",

            function (contenido) {

                var datos;

                try {
                    datos = JSON.parse(contenido);
                } catch (error) {
                    console.error("Error al interpretar el GeoJSON:", error);
                    console.log("Contenido recibido:", contenido.substring(0, 500));
                    return;
                }

                if (!datos.features) {
                    console.error("El GeoJSON no contiene features.");
                    return;
                }

                var recorridos = {};

                datos.features.forEach(function (feature) {

                    var propiedades = feature.properties || {};

                    var nombreLinea = String(
                        propiedades.ROUTE_SHORT_NAME || ""
                    ).trim().toUpperCase();

                    if (!nombreLinea) return;

                    var geometria = feature.geometry;

                    if (!geometria) return;

                    var trazados = [];

                    if (geometria.type === "LineString") {
                        trazados.push(geometria.coordinates);
                    }

                    if (geometria.type === "MultiLineString") {
                        trazados = geometria.coordinates;
                    }

                    if (!recorridos[nombreLinea]) {
                        recorridos[nombreLinea] = [];
                    }

                    trazados.forEach(function (trazado) {

                        var puntos = [];

                        trazado.forEach(function (coordenada) {

                            var punto = convertirCoordenadas(
                                coordenada[1],
                                coordenada[0]
                            );

                            punto.y = 0.20;

                            if (
                                puntos.length === 0 ||
                                puntos[puntos.length - 1].distanceTo(punto) > 0.0001
                            ) {
                                puntos.push(punto);
                            }
                        });

                        if (puntos.length >= 2) {
                            recorridos[nombreLinea].push(puntos);
                        }
                    });
                });

                var nombresLineas = Object.keys(recorridos).sort(
                    function (a, b) {
                        return a.localeCompare(b, undefined, {
                            numeric: true,
                            sensitivity: "base"
                        });
                    }
                );

                nombresLineas.forEach(function (nombreLinea, indice) {

                    coloresLineas[nombreLinea] =
                        obtenerColorLinea(nombreLinea, indice);

                    var grupo = new THREE.Group();

                    grupo.name = "Linea " + nombreLinea;

                    gruposLineas[nombreLinea] = grupo;

                    escena.add(grupo);

                    recorridos[nombreLinea].forEach(function (puntos) {

                        var geometriaRuta = new THREE.BufferGeometry()
                            .setFromPoints(puntos);

                        var materialRuta = new THREE.LineBasicMaterial({
                            color: coloresLineas[nombreLinea],
                            linewidth: 2
                        });

                        var linea = new THREE.Line(
                            geometriaRuta,
                            materialRuta
                        );

                        grupo.add(linea);
                    });

                    crearGuagua(
                        nombreLinea,
                        recorridos[nombreLinea]
                    );
                });

                crearMenuLineas(nombresLineas);

                console.log("Líneas encontradas:", nombresLineas);
                console.log("Número de guaguas:", guaguasAnimadas.length);
            },

            undefined,

            function (error) {
                console.error("Error cargando el GeoJSON:", error);
            }
        );

        // ==================================================
        // POSICIÓN INICIAL DE LA CÁMARA
        // ==================================================

        var ancho =
            (maxLon - minLon) * factorLongitud * escala;

        var alto =
            (mercatorY(maxLat) - mercatorY(minLat)) *
            Math.cos(latCentro * Math.PI / 180) * escala;

        // Distancia un poco mayor para apreciar el mapa ampliado.

        var distancia = Math.max(ancho, alto) * 1.05;

        camara.position.set(
            distancia,
            distancia,
            distancia
        );

        camara.lookAt(0, 0, 0);
        controles.target.set(0, 0, 0);
        controles.update();
    },

    undefined,

    function (error) {
        console.error("Error cargando el archivo OSM:", error);
    }
);

// ==================================================
// ANIMACIÓN DE LAS GUAGUAS
// ==================================================

function actualizarGuaguas(delta) {

    guaguasAnimadas.forEach(function (guagua) {

        guagua.distanciaActual += guagua.velocidad * delta;

        if (guagua.distanciaActual >= guagua.longitudTotal) {
            guagua.distanciaActual = 0;
        }

        var distancias = guagua.distancias;
        var puntos = guagua.puntos;

        var indice = 0;

        while (
            indice < distancias.length - 2 &&
            distancias[indice + 1] < guagua.distanciaActual
            ) {
            indice++;
        }

        var distanciaInicial = distancias[indice];
        var distanciaFinal = distancias[indice + 1];

        var longitudSegmento = distanciaFinal - distanciaInicial;

        var proporcion = longitudSegmento > 0
            ? (guagua.distanciaActual - distanciaInicial) / longitudSegmento
            : 0;

        var puntoInicial = puntos[indice];
        var puntoFinal = puntos[indice + 1];

        guagua.objeto.position.lerpVectors(
            puntoInicial,
            puntoFinal,
            proporcion
        );

        guagua.objeto.position.y = 0.30;

        var dx = puntoFinal.x - puntoInicial.x;
        var dz = puntoFinal.z - puntoInicial.z;

        guagua.objeto.rotation.y = Math.atan2(dx, dz);
    });
}

// ==================================================
// BUCLE PRINCIPAL
// ==================================================

function animar() {

    requestAnimationFrame(animar);

    var delta = Math.min(reloj.getDelta(), 0.05);

    controles.update();

    actualizarGuaguas(delta);

    renderizador.render(escena, camara);
}

animar();

// ==================================================
// ADAPTACIÓN AL TAMAÑO DE LA VENTANA
// ==================================================

window.addEventListener("resize", function () {

    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();

    renderizador.setSize(
        window.innerWidth,
        window.innerHeight
    );

    controles.handleResize();
});
