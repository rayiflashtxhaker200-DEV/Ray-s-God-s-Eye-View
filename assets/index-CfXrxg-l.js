(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const a of s)if(a.type==="childList")for(const n of a.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&i(n)}).observe(document,{childList:!0,subtree:!0});function t(s){const a={};return s.integrity&&(a.integrity=s.integrity),s.referrerPolicy&&(a.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?a.credentials="include":s.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function i(s){if(s.ep)return;s.ep=!0;const a=t(s);fetch(s.href,a)}})();const Q="gev_hardware_mode";function re(){if(typeof window>"u")return!0;const e=localStorage.getItem(Q);if(e==="low")return!0;if(e==="high")return!1;if(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4||navigator.deviceMemory&&navigator.deviceMemory<=8)return!0;try{const o=document.createElement("canvas"),t=o.getContext("webgl")||o.getContext("experimental-webgl");if(t){const i=t.getExtension("WEBGL_debug_renderer_info");if(i){const s=String(t.getParameter(i.UNMASKED_RENDERER_WEBGL)||"").toLowerCase();if(["radeon hd 5","radeon hd 6","radeon mobility","mobility radeon","e-450","e-350","e-300","intel hd","intel(r) hd","ironlake","gma","llvmpipe","swiftshader","geforce 9","geforce 8","geforce 2","geforce 3","geforce 4","mesa"].some(n=>s.includes(n)))return!0}}}catch{return!0}return!1}function D(){const e=re();return{isLowSpec:e,msaaSamples:e?1:2,targetFrameRate:e?30:60,resolutionScale:e?.85:1,tileCacheBytes:e?256*1024*1024:1024*1024*1024,maximumCacheOverflowBytes:e?128*1024*1024:512*1024*1024,maximumScreenSpaceError:e?28:16,globeTileCacheSize:e?40:100,globeMaximumScreenSpaceError:e?2.5:1.5,pollIntervalIdle:e?2500:1500,pollIntervalActive:1e3,pollIntervalBackground:5e3}}function O(e,o=null){if(!(e!=null&&e.scene))return;const t=D();try{e.targetFrameRate=t.targetFrameRate,e.resolutionScale=t.resolutionScale;const i=e.scene;i.globe&&(i.globe.tileCacheSize=t.globeTileCacheSize,i.globe.maximumScreenSpaceError=t.globeMaximumScreenSpaceError,i.globe.showWaterEffect=!t.isLowSpec,i.globe.enableLighting=!1),i.fog&&(i.fog.enabled=!1),o&&(o.maximumScreenSpaceError=t.maximumScreenSpaceError,o.skipLevelOfDetail=t.isLowSpec,t.isLowSpec&&(o.baseScreenSpaceError=1024,o.skipScreenSpaceErrorFactor=16,o.skipLevels=1,o.immediatelyLoadDesiredLevelOfDetail=!1,o.loadSiblings=!1,o.cullWithChildrenBounds=!0)),console.info(`[HardwareProfile] Applied optimizations: lowSpec=${t.isLowSpec}, fps=${t.targetFrameRate}, tileCache=${Math.round(t.tileCacheBytes/1024/1024)}MB`)}catch(i){console.warn("[HardwareProfile] Failed to apply optimizations:",i)}}function ne({container:e,creditContainer:o}){if(!e||!o)throw new TypeError("Viewer and credit containers are required");const t=D(),i=new Cesium.TileMapServiceImageryProvider({url:Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")}),s=new Cesium.ImageryLayer(i),a=new Cesium.Viewer(e,{timeline:!1,animation:!1,baseLayerPicker:!1,geocoder:!1,homeButton:!1,sceneModePicker:!1,navigationHelpButton:!1,fullscreenButton:!1,vrButton:!1,selectionIndicator:!1,infoBox:!1,baseLayer:s,creditContainer:o,msaaSamples:t.msaaSamples,contextOptions:{webgl:{preserveDrawingBuffer:!0,powerPreference:"low-power"}}});try{return a.targetFrameRate=t.targetFrameRate,a.resolutionScale=t.resolutionScale,a.scene.globe.show=!0,a.scene.globe.baseColor=Cesium.Color.fromCssColorString("#0f172a"),a.scene.globe.enableLighting=!1,a.scene.fog&&(a.scene.fog.enabled=!1),a.scene.skyAtmosphere.show=!0,O(a),a}catch(n){throw a.destroy(),n}}let S=null,H=!1;const T=new Set;function se(e){e&&(S=e,H=!0,e.scene&&(e.scene.requestRenderMode=T.size===0,typeof e.scene.maximumRenderTimeChange=="number"&&(e.scene.maximumRenderTimeChange=1)))}function le(e){e!==S&&S!==null||(S!=null&&S.scene&&(S.scene.requestRenderMode=!1),S=null,H=!1,T.clear())}function k(e="manual"){var o;if(!(!H&&!S)&&(o=S==null?void 0:S.scene)!=null&&o.requestRender)try{S.scene.requestRender()}catch{}}function M(e){if(e&&(T.add(e),S!=null&&S.scene)){S.scene.requestRenderMode=!1;try{S.scene.requestRender()}catch{}}}function z(e){e&&(T.delete(e),S!=null&&S.scene&&T.size===0&&(S.scene.requestRenderMode=!0))}function B(e){return typeof e=="string"&&e.trim().length?e.trim():null}async function de(e,{googleApiKey:o,cesiumToken:t}={}){const i=B(o),s=B(t),a=[],n=[];i&&n.push({route:"google-direct",googleKey:i}),s&&n.push({route:"google-ion",googleKey:void 0});for(const u of n)try{return{tileset:u.googleKey?await ce(e,u.googleKey):await pe(e,s),route:u.route,errors:a}}catch(p){a.push(p instanceof Error?p:new Error(String(p)))}return{tileset:null,route:"osm",errors:a}}function ce(e,o,t={}){if(o=B(o),!o)throw new Error("Google 3D requires an explicit browser key");const i=D();return e.createGooglePhotorealistic3DTileset({key:o,onlyUsingWithGoogleGeocoder:!0,cacheBytes:i.tileCacheBytes,maximumCacheOverflowBytes:i.maximumCacheOverflowBytes,maximumScreenSpaceError:i.maximumScreenSpaceError,skipLevelOfDetail:i.isLowSpec,cullWithChildrenBounds:i.isLowSpec,...t})}async function pe(e,o,{signal:t,...i}={}){if(o=B(o),!o)throw new Error("Google 3D through ion requires an explicit token");t==null||t.throwIfAborted();const s=await e.IonResource.fromAssetId(2275207,{accessToken:o});t==null||t.throwIfAborted();const a=D();return e.Cesium3DTileset.fromUrl(s,{cacheBytes:a.tileCacheBytes,maximumCacheOverflowBytes:a.maximumCacheOverflowBytes,maximumScreenSpaceError:a.maximumScreenSpaceError,skipLevelOfDetail:a.isLowSpec,cullWithChildrenBounds:a.isLowSpec,enableCollision:!0,...i})}function ue({googleApiKey:e,cesiumToken:o,allowQaRegistration:t=!1}={}){let i={status:"created",phase:null},s=null,a=null,n=null,u=null;async function p(){var f;i={status:"starting",phase:"scene"};const d=document.querySelector("#loading-screen .loader-status"),l=document.getElementById("loading-screen");d&&(d.textContent="Configurando visor 3D..."),o&&(Cesium.Ion.defaultAccessToken=o);let y=document.getElementById("cesiumContainer");y||(y=document.createElement("div"),y.id="cesiumContainer",y.style.cssText="position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden;",document.body.prepend(y)),u=document.getElementById("cesium-credits"),u||(u=document.createElement("div"),u.id="cesium-credits",u.style.cssText="position: absolute; bottom: 4px; left: 8px; z-index: 100; font-size: 10px; color: rgba(255,255,255,0.4); pointer-events: none;",document.body.appendChild(u));try{a=ne({container:y,creditContainer:u}),se(a),O(a),(f=a.scene)!=null&&f.globe&&(a.scene.globe.show=!0,a.scene.globe.enableLighting=!1,a.scene.globe.baseColor=Cesium.Color.fromCssColorString("#0f172a"),a.scene.globe.tileLoadProgressEvent.addEventListener(c=>{c>0&&k("tile-stream")})),d&&(d.textContent=e||o?"Cargando terreno 3D fotorrealista...":"Cargando planeta Tierra en 3D...");let b="satellite";if(e||o)try{const c=await de(Cesium,{googleApiKey:e,cesiumToken:o});c!=null&&c.tileset?(n=c.tileset,a.scene.primitives.add(n),b=c.route):b="satellite"}catch(c){console.warn("Tileset loading error, falling back to satellite imagery:",c),b="satellite"}(!n||b==="satellite")&&Cesium.ArcGisMapServerImageryProvider.fromUrl("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",{enablePickFeatures:!1}).then(c=>{a&&!a.isDestroyed()&&(a.imageryLayers.addImageryProvider(c),k("arcgis-stream-ready"))}).catch(c=>{console.warn("ArcGIS satellite imagery stream error, using base earth map:",c)});try{a.camera.setView({destination:Cesium.Cartesian3.fromDegrees(2.3522,48.8566,25e4),orientation:{heading:Cesium.Math.toRadians(15),pitch:Cesium.Math.toRadians(-45),roll:0}})}catch{}}catch(b){console.warn("Cesium WebGL initialization failed (fallback to presentation view):",b),a=null,y&&(y.innerHTML=`
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);">
            <div style="text-align: center; max-width: 520px; padding: 32px; color: #94a3b8;">
              <div style="font-size: 54px; margin-bottom: 16px;">🌍</div>
              <div style="font-size: 20px; font-weight: 700; color: #38bdf8; margin-bottom: 10px;">
                El Realismo en la Literatura
              </div>
              <div style="font-size: 13.5px; color: #cbd5e1; line-height: 1.6; margin-bottom: 16px;">
                Exposición — Juan David De Avila Delgado
              </div>
              <div style="font-size: 12px; color: #64748b; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 8px; padding: 10px 14px;">
                Panel interactivo listo. Navega por las etapas con los controles o vincula tu celular como mando a distancia.
              </div>
            </div>
          </div>
        `)}return window.__godsEyeView={viewer:a,tileset:n,requestRender:k,styleManager:{viewer:a,initialRestorePromise:Promise.resolve(),orbitController:{stop:()=>{}},hud:{destroy:()=>{}},dispose:()=>{}},dataManager:{layers:new Map,setEnabled:async()=>!0,destroyAll:async()=>{}}},i={status:"ready",phase:null},l&&setTimeout(()=>{l.classList.add("hidden"),setTimeout(()=>{l.style.display="none"},700)},500),k("ready"),{viewer:a,tileset:n}}return{start(){return s||(s=p()),s},destroy(){var d;return a&&!a.isDestroyed()&&(le(a),a.destroy()),a=null,n=null,u&&u.remove(),((d=window.__godsEyeView)==null?void 0:d.viewer)===a&&delete window.__godsEyeView,i={status:"destroyed",phase:null},Promise.resolve()},getState:()=>i,getComponents:()=>({viewer:a,tileset:n}),subscribe(d){return typeof d=="function"&&d(i),()=>{}}}}function ge(e){if(!e)return"Unknown initialization error";if(e instanceof Error)return e.message&&e.message.trim()?e.message.trim():e.name||"Initialization error";if(typeof e=="string"&&e.trim())return e.trim();if(typeof e=="object"){const o=String(e.message||e.error||"").trim();if(o)return o;try{const t=JSON.stringify(e);if(t&&t!=="{}")return t}catch{}}return String(e)}const Z="gev_shared_user_code",ee="gev_custom_destinations",te="gev_active_preset_password",W={alfa1234:[{id:"def_alfa_1",name:"Base Ártica Thule",lat:76.5312,lon:-68.7032,height:15e3},{id:"def_alfa_2",name:"Nevada Test Range (Área 51)",lat:37.2431,lon:-115.793,height:1e4},{id:"def_alfa_3",name:"Observatorio Mauna Kea",lat:19.8206,lon:-155.4681,height:12e3}],tactical2026:[{id:"def_tact_1",name:"Estrecho de Gibraltar",lat:35.98,lon:-5.6,height:28e3},{id:"def_tact_2",name:"Canal de Suez",lat:30.5852,lon:32.2654,height:22e3},{id:"def_tact_3",name:"Canal de Panamá",lat:9.08,lon:-79.68,height:2e4},{id:"def_tact_4",name:"Estrecho de Malaca",lat:1.43,lon:103.1,height:25e3}],ciudades99:[{id:"def_city_1",name:"Times Square, Nueva York",lat:40.758,lon:-73.9855,height:3500},{id:"def_city_2",name:"Cruce de Shibuya, Tokio",lat:35.6595,lon:139.7004,height:3500},{id:"def_city_3",name:"Torre Eiffel, París",lat:48.8584,lon:2.2945,height:3500},{id:"def_city_4",name:"Big Ben, Londres",lat:51.5007,lon:-.1246,height:3500}]},q=new Map;function P(){return typeof localStorage<"u"?localStorage:{getItem:e=>q.get(e)??null,setItem:(e,o)=>q.set(e,String(o)),removeItem:e=>q.delete(e)}}function G(e){return String(e??"").trim().length<4?{valid:!1,error:"El nombre de usuario o código debe tener al menos 4 caracteres o dígitos."}:{valid:!0}}function A(){const e=P().getItem(Z);return e&&e.trim().length>=4?e.trim():"user1234"}function N(e){const o=G(e);if(!o.valid)throw new Error(o.error);const t=e.trim();if(P().setItem(Z,t),typeof window<"u"){window.dispatchEvent(new CustomEvent("gev:user-code-changed",{detail:t}));const i=document.getElementById("gev-input-pc-user");i&&i.value!==t&&(i.value=t)}return t}function fe(){return P().getItem(te)||""}function j(e=""){const o=String(e??"").trim().toLowerCase();return P().setItem(te,o),o}function R(e=""){const o=String(e??"").trim().toLowerCase();if(!o)return I();try{const t=P().getItem(`gev_preset_pass_${o}`);if(t){const i=JSON.parse(t);if(Array.isArray(i)&&i.length)return i}}catch{}return W[o]?[...W[o]]:[]}function oe(e="",o=[]){const t=String(e??"").trim().toLowerCase(),i=Array.isArray(o)?o:[];return t?(P().setItem(`gev_preset_pass_${t}`,JSON.stringify(i)),i):(U(i),i)}function I(){try{const e=P().getItem(ee);return e?JSON.parse(e):[]}catch{return[]}}function U(e){const o=Array.isArray(e)?e:[];return P().setItem(ee,JSON.stringify(o)),o}function K({name:e,lat:o,lon:t,height:i=15e3,password:s=""}){const a=String(s??"").trim().toLowerCase(),n=a?R(a):I(),u={id:`dest_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,name:String(e||"Mi Destino").trim(),lat:Number(o),lon:Number(t),height:Number(i||15e3),createdAt:Date.now()};return n.push(u),a?oe(a,n):U(n),u}function me(e,o=""){const t=String(o??"").trim().toLowerCase(),i=(t?R(t):I()).filter(s=>s.id!==e);return t?oe(t,i):U(i),i}function be(e){if(!(e!=null&&e.camera))return null;try{const o=e.camera.positionCartographic;if(o){const t=o.latitude*180/Math.PI,i=o.longitude*180/Math.PI,s=Math.round(o.height);return{lat:Number(t.toFixed(5)),lon:Number(i.toFixed(5)),height:Math.max(500,s)}}}catch{}return null}async function xe({serverUrl:e="",sessionName:o="default",destinations:t,password:i="",fetchImpl:s=typeof fetch<"u"?fetch:null}={}){if(!s)return null;const n=`${e.replace(/\/+$/,"")}/api/remote/session`,u=String(i??"").trim().toLowerCase(),p=t??(u?R(u):I()),l=await s(n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionName:o,password:u,deviceName:"PC Master",deviceType:"pc",customLocations:p,command:{action:"sync_custom_locations",args:{locations:p,password:u}}})});if(!l.ok)throw new Error(`HTTP ${l.status}`);return l.json()}function ye(e){if(typeof document>"u"||document.getElementById("gev-pc-pairing-btn"))return;const o=document.createElement("button");o.id="gev-pc-pairing-btn",o.innerHTML="📱 Conexión Móvil y Destinos",o.style.cssText=`
    position: fixed; bottom: 18px; left: 18px; z-index: 9998;
    background: #0f172a; border: 1px solid #00e5ff; color: #00e5ff;
    padding: 8px 14px; border-radius: 6px; font-family: 'JetBrains Mono', monospace;
    font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center;
    gap: 8px; box-shadow: 0 4px 16px rgba(0, 229, 255, 0.15); transition: all 0.2s ease;
  `,o.addEventListener("mouseenter",()=>{o.style.background="#1e293b",o.style.boxShadow="0 4px 20px rgba(0, 229, 255, 0.3)"}),o.addEventListener("mouseleave",()=>{o.style.background="#0f172a",o.style.boxShadow="0 4px 16px rgba(0, 229, 255, 0.15)"}),document.body.appendChild(o);const t=document.createElement("div");t.id="gev-pc-pairing-modal",t.style.cssText=`
    display: none; position: fixed; inset: 0; z-index: 99999;
    background: rgba(4, 7, 13, 0.78); backdrop-filter: blur(4px);
    align-items: center; justify-content: center; padding: 16px;
    font-family: 'JetBrains Mono', monospace, sans-serif;
  `;let i=fe()||"";t.innerHTML=`
    <div style="background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; color: #e2e8f0; padding: 20px; box-sizing: border-box; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 16px; color: #fff; display: flex; align-items: center; gap: 8px;">
          <span>📱</span> Conexión Móvil y Perfiles con Contraseña
        </h2>
        <button id="gev-modal-close" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <!-- Variable 1: Usuario compartido (minimo 4 digitos) -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #00e5ff; font-weight: 600; margin-bottom: 6px;">
          1. Nombre de Usuario Compartido (Mín. 4 caracteres)
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Pon este mismo usuario en el móvil (?remote=mobile) para emparejarte a este mapa.
        </p>
        <div style="display: flex; gap: 8px;">
          <input id="gev-input-pc-user" type="text" value="${s(A())}" placeholder="Mínimo 4 caracteres (ej: user1234)"
            style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px; font-family: inherit;" />
          <button id="gev-btn-save-user" style="background: #0284c7; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
            Guardar
          </button>
        </div>
        <div id="gev-user-feedback" style="font-size: 11px; margin-top: 6px; display: none;"></div>
      </div>

      <!-- Variable 2: Contrasena de Perfil de Destinos -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600; margin-bottom: 6px;">
          2. Contraseña del Perfil de Destinos
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Con cada contraseña se carga un conjunto de destinos diferente. Puedes usar las claves del sistema (<strong>alfa1234</strong>, <strong>tactical2026</strong>, <strong>ciudades99</strong>) o escribir tu propia contraseña secreta:
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <input id="gev-input-pc-password" type="text" value="${s(i)}" placeholder="Ej: alfa1234, tactical2026, o tu clave..."
            style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px; font-family: inherit;" />
          <button id="gev-btn-apply-password" style="background: #38bdf8; color: #020617; border: none; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">
            Cargar Clave
          </button>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="gev-btn-quick-pass" data-pass="alfa1234" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 alfa1234</button>
          <button class="gev-btn-quick-pass" data-pass="tactical2026" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 tactical2026</button>
          <button class="gev-btn-quick-pass" data-pass="ciudades99" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 ciudades99</button>
        </div>
      </div>

      <!-- Variable 3: Optimizacion de Servidor y PC Antigua (Dell i5 1ra Gen, AMD E-450, HDD 298GB) -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #10b981; font-weight: 600; margin-bottom: 6px;">
          ⚡ 3. Optimización para PC / Servidor Antiguo (Core i5 1ra Gen / AMD E-450 / HDD 5400 RPM)
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Evita que la máquina se congele ("trabe"): limita a 30 FPS para evitar sobrecalentamiento, reduce la caché de tiles a 256 MB para no saturar el HDD de 298 GB con archivos de paginación, y desactiva MSAA pesado en gráficas Radeon 5000 / E-450.
        </p>
        <div style="display: flex; gap: 8px;">
          <button id="gev-btn-hw-low" style="flex: 1; background: #064e3b; border: 1px solid #059669; color: #34d399; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            ⚡ Modo Ahorro / PC Antigua
          </button>
          <button id="gev-btn-hw-auto" style="flex: 1; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Auto (Recomendado)
          </button>
          <button id="gev-btn-hw-high" style="flex: 1; background: #1e293b; border: 1px solid #334155; color: #94a3b8; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Alta Calidad
          </button>
        </div>
        <div id="gev-hw-feedback" style="font-size: 11px; color: #34d399; margin-top: 6px; display: none;"></div>
      </div>

      <!-- Destinos del perfil actual -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #00e5ff; font-weight: 600;">
            Destinos de: <span id="gev-label-active-pass" style="color: #38bdf8;">${i||"(General)"}</span>
          </div>
          <button id="gev-btn-sync-all" style="background: #059669; color: #fff; border: none; border-radius: 4px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
            🔄 Sincronizar Perfil
          </button>
        </div>

        <button id="gev-btn-capture-camera" style="
          width: 100%; background: #1e293b; border: 1px dashed #38bdf8; color: #38bdf8;
          border-radius: 6px; padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer;
          margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
        ">
          📍 Guardar vista actual de la cámara en este perfil
        </button>

        <!-- Formulario manual -->
        <div style="background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; margin-bottom: 14px;">
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px;">O agregar manualmente:</div>
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 6px; margin-bottom: 6px;">
            <input id="gev-input-dest-name" type="text" placeholder="Nombre" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
            <input id="gev-input-dest-lat" type="number" step="any" placeholder="Latitud" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
            <input id="gev-input-dest-lon" type="number" step="any" placeholder="Longitud" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
          </div>
          <button id="gev-btn-add-manual-dest" style="background: #334155; color: #f1f5f9; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer; width: 100%;">
            + Agregar a esta contraseña
          </button>
        </div>

        <div id="gev-destinations-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
        </div>
      </div>
    </div>
  `,document.body.appendChild(t);function s(d){return String(d??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function a(){const d=t.querySelector("#gev-destinations-list"),l=t.querySelector("#gev-label-active-pass");l&&(l.textContent=i||"(General)");const y=R(i);if(!y.length){d.innerHTML=`
        <div style="font-size: 11px; color: #64748b; text-align: center; padding: 12px;">
          No hay destinos guardados para esta contraseña aún.
        </div>
      `;return}d.innerHTML=y.map(f=>`
      <div style="display: flex; justify-content: space-between; align-items: center; background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 8px 10px;">
        <div>
          <div style="font-size: 12px; font-weight: 600; color: #f8fafc;">📍 ${s(f.name)}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            Lat: ${f.lat}, Lon: ${f.lon} | Alt: ${f.height}m
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="gev-btn-fly" data-lat="${f.lat}" data-lon="${f.lon}" data-height="${f.height}" style="background: #0284c7; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
            Volar
          </button>
          <button class="gev-btn-del" data-id="${f.id}" style="background: #450a0a; color: #f87171; border: 1px solid #dc2626; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
            ✕
          </button>
        </div>
      </div>
    `).join(""),d.querySelectorAll(".gev-btn-fly").forEach(f=>{f.addEventListener("click",()=>{var g;const b=Number(f.getAttribute("data-lat")),c=Number(f.getAttribute("data-lon")),r=Number(f.getAttribute("data-height"));(g=e==null?void 0:e.camera)!=null&&g.flyTo&&(M("custom-dest-fly"),k(),e.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(c,b,r),duration:2,complete:()=>{z("custom-dest-fly"),k()},cancel:()=>{z("custom-dest-fly"),k()}}))})}),d.querySelectorAll(".gev-btn-del").forEach(f=>{f.addEventListener("click",()=>{const b=f.getAttribute("data-id");me(b,i),a(),n()})})}async function n(){const d=t.querySelector("#gev-user-feedback");try{const l=A(),y=R(i);await xe({sessionName:l,password:i,destinations:y}),d&&(d.style.display="block",d.style.color="#34d399",d.textContent=`✅ Perfil "${i||"General"}" sincronizado. Al poner esta clave en el móvil se cargarán estos destinos.`)}catch{}}o.addEventListener("click",()=>{t.style.display="flex",a()}),t.querySelector("#gev-modal-close").addEventListener("click",()=>{t.style.display="none"}),t.querySelector("#gev-btn-save-user").addEventListener("click",()=>{const d=t.querySelector("#gev-input-pc-user"),l=t.querySelector("#gev-user-feedback"),y=d.value.trim(),f=G(y);if(l.style.display="block",!f.valid){l.style.color="#f87171",l.textContent=`❌ ${f.error}`;return}N(y),l.style.color="#34d399",l.textContent=`✅ Usuario "${y}" guardado. Usa este mismo nombre en tu móvil.`,n()}),t.querySelector("#gev-btn-apply-password").addEventListener("click",()=>{const d=t.querySelector("#gev-input-pc-password");i=j(d.value),a(),n()}),t.querySelectorAll(".gev-btn-quick-pass").forEach(d=>{d.addEventListener("click",()=>{const l=d.getAttribute("data-pass");t.querySelector("#gev-input-pc-password").value=l,i=j(l),a(),n()})}),t.querySelector("#gev-btn-capture-camera").addEventListener("click",()=>{const d=be(e);if(!d){alert("No se pudo obtener la posición actual de la cámara.");return}const l=prompt("Nombre para esta ubicación:",`Destino (${d.lat}, ${d.lon})`);l&&(K({name:l,lat:d.lat,lon:d.lon,height:d.height,password:i}),a(),n())}),t.querySelector("#gev-btn-add-manual-dest").addEventListener("click",()=>{const d=t.querySelector("#gev-input-dest-name"),l=t.querySelector("#gev-input-dest-lat"),y=t.querySelector("#gev-input-dest-lon"),f=d.value.trim()||"Punto de Interés",b=parseFloat(l.value),c=parseFloat(y.value);if(isNaN(b)||isNaN(c)){alert("Por favor introduce latitud y longitud válidas.");return}K({name:f,lat:b,lon:c,height:18e3,password:i}),d.value="",l.value="",y.value="",a(),n()});const u=t.querySelector("#gev-hw-feedback");function p(d){localStorage.setItem(Q,d),O(e);const l=D();u&&(u.style.display="block",d==="low"?u.textContent="⚡ Modo PC Antigua activo: 30 FPS, caché de 256MB, antialiasing ligero (evita congelar HDD de 298GB y CPU i5/E-450).":d==="high"?u.textContent="🚀 Modo Alta Calidad activo: 60 FPS, caché completa.":u.textContent=`🔍 Modo Automático: Detectado ${l.isLowSpec?"Hardware Legacy (Modo Ahorro)":"Hardware Estándar"}.`)}t.querySelector("#gev-btn-hw-low").addEventListener("click",()=>p("low")),t.querySelector("#gev-btn-hw-auto").addEventListener("click",()=>p("auto")),t.querySelector("#gev-btn-hw-high").addEventListener("click",()=>p("high")),t.querySelector("#gev-btn-sync-all").addEventListener("click",n),n()}const _=[{id:"1_paris_origen",buttonLabel:"1. París — Origen Europeo",coordinates:{lat:48.8566,lng:2.3522,alt:25e4,pitch:-45,heading:15},title:"Origen y Evolución: Europa a América",subtitle:"París, Francia — Siglo XIX",details:"El Realismo nace en Francia como reacción objetiva al Romanticismo, influenciado por el positivismo e industrialización urbana de la burguesía.",authorsAndWorks:["Gustave Flaubert — Madame Bovary","Honoré de Balzac — La Comedia Humana"],relationToEurope:"Punto de partida del método de observación directa.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Gustave_Flaubert.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/Honoré_de_Balzac.jpg"]},{id:"2_pampas_martin_fierro",buttonLabel:"2. Las Pampas — El Gaucho",coordinates:{lat:-34.6037,lng:-58.3816,alt:22e4,pitch:-45,heading:0},title:"Costumbrismo: El Gaucho Martín Fierro",subtitle:"Buenos Aires y Las Pampas, Argentina",details:"Retrato de hábitos, dialectos y la vida rural del gaucho marginado por las nuevas políticas de frontera.",authorsAndWorks:["José Hernández — El Gaucho Martín Fierro"],relationToEurope:"Reemplaza la figura del burgués europeo por el tipo humano criollo y rural.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/José_Hernández.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/El_Gaucho_Martin_Fierro_1872.jpg"]},{id:"3_bogota_manuela",buttonLabel:"3. Bogotá/Andes — Manuela",coordinates:{lat:4.711,lng:-74.0721,alt:18e4,pitch:-45,heading:-30},title:"Costumbrismo Andino y Llanero",subtitle:"Bogotá y Valles Interandinos, Colombia",details:"Representación de los tipos sociales del interior del país, costumbres locales, tensiones de clase y vida campesina.",authorsAndWorks:["Eugenio Díaz Castro — Manuela","José María Samper — El Murciélago"],relationToEurope:"Enfocado en la búsqueda de la identidad nacional autóctona frente a los modelos extranjeros.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Eugenio_Díaz_Castro.jpg"]},{id:"4_argentina_facundo",buttonLabel:"4. La Pampa — Civilización y Barbarie",coordinates:{lat:-31.4201,lng:-64.1888,alt:25e4,pitch:-45,heading:10},title:"Civilización vs. Barbarie",subtitle:"Provincias del Río de la Plata, Argentina",details:"Dicotómica visión entre el progreso de matriz europea (las ciudades) y la vida salvaje del caudillismo y el campo.",authorsAndWorks:["Domingo Faustino Sarmiento — Facundo"],relationToEurope:"Contrapone el ideal ilustrado europeo a las dinámicas sociales nativas.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Domingo_Faustino_Sarmiento.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/Facundo.jpg"]},{id:"5_rio_realismo_brasileno",buttonLabel:"5. Río de Janeiro — Realismo Brasileño",coordinates:{lat:-22.9068,lng:-43.1729,alt:2e5,pitch:-45,heading:45},title:"Realismo Brasileño y la Modernización",subtitle:"Río de Janeiro y Vías del Ferrocarril, Brasil",details:"Análisis testimonial de la transformación del territorio rural a la urbe industrial y el impacto del progreso técnico.",authorsAndWorks:["Machado de Assis — Memorias Póstumas de Brás Cubas","Euclides da Cunha — Los Sertones"],relationToEurope:"Observación directa de los cambios provocados por la llegada del ferrocarril de estilo europeo.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Machado_de_Assis.jpg"]},{id:"6_amazonia_la_voragine",buttonLabel:"6. Selva Amazónica — La Vorágine",coordinates:{lat:1.2136,lng:-72.0312,alt:22e4,pitch:-45,heading:-15},title:"Novela de la Tierra / Regionalismo",subtitle:"Selva Amazónica y Llanos Orientales, Colombia",details:"Lucha voraz y sometimiento trágico del ser humano ante la naturaleza indómita y la fiebre del caucho.",authorsAndWorks:["José Eustasio Rivera — La Vorágine"],relationToEurope:"Derivado directo del Naturalismo europeo (determinismo ambiental sobre el individuo).",images:["https://commons.wikimedia.org/wiki/Special:FilePath/José_Eustasio_Rivera.jpg"]},{id:"7_quito_huasipungo",buttonLabel:"7. Los Andes — Huasipungo",coordinates:{lat:-.1807,lng:-78.4678,alt:2e5,pitch:-45,heading:20},title:"Indigenismo y Denuncia Social",subtitle:"Serranía Andina, Ecuador",details:"Denuncia explícita del despojo territorial, la servidumbre y la explotación de las comunidades originarias.",authorsAndWorks:["Jorge Icaza — Huasipungo"],relationToEurope:"Rompe con la visión exótica del indígena propia de la literatura romántica europea.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Jorge_Icaza.jpg"]},{id:"8_misisipi_huckleberry",buttonLabel:"8. Río Misisipi — Huckleberry Finn",coordinates:{lat:39.7084,lng:-91.3585,alt:22e4,pitch:-45,heading:-10},title:"Regionalismo Norteamericano",subtitle:"Río Misisipi, Hannibal, Missouri (EE. UU.)",details:"Registro minucioso del dialecto popular, folclor, discriminación y la vida en las riberas del Misisipi.",authorsAndWorks:["Mark Twain — Las aventuras de Huckleberry Finn"],relationToEurope:"Construcción de una narrativa auténticamente estadounidense alejada del purismo británico.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Mark_Twain.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/Huck_Finn_1884_cover.jpg"]},{id:"9_nueva_york_henry_james",buttonLabel:"9. Nueva York — Realismo Psicológico",coordinates:{lat:40.7128,lng:-74.006,alt:2e5,pitch:-45,heading:30},title:"Realismo Psicológico",subtitle:"Nueva York (EE. UU.) / Inglaterra",details:"Estudio profundo de la conciencia humana, dilemas morales, ambigüedad narrativa y percepción interna.",authorsAndWorks:["Henry James — Otra vuelta de tuerca"],relationToEurope:"Conexión directa con la técnica narrativa introspectiva de Flaubert y Turguénev.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/Henry_James.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/Turn_of_the_screw.jpg"]},{id:"10_california_realismo_social",buttonLabel:"10. California — Realismo Social y Sucio",coordinates:{lat:36.6777,lng:-121.6555,alt:25e4,pitch:-45,heading:-25},title:"Realismo Social y Realismo Sucio",subtitle:"Valle de Salinas y Costa Oeste (EE. UU.)",details:"Registro de los estragos de la Gran Depresión y la cotidianidad de las clases trabajadoras con diálogos mínimos e intensos.",authorsAndWorks:["John Steinbeck — Las uvas de la ira","Raymond Carver — De qué hablamos cuando hablamos de amor"],relationToEurope:"Quiebra las descripciones extensas del siglo XIX mediante un minimalismo crudo y directo.",images:["https://commons.wikimedia.org/wiki/Special:FilePath/John_Steinbeck.jpg","https://commons.wikimedia.org/wiki/Special:FilePath/Raymond_Carver.jpg"]}];typeof window<"u"&&!window.Cesium&&(window.Cesium=Cesium);function he(e=typeof window<"u"?window.location.search:""){if(!e)return!1;const o=new URLSearchParams(e.startsWith("?")?e:`?${e}`);return o.get("remote")==="mobile"||o.get("device")==="mobile"}function V(e=""){var t;let o=String(e||"").trim();return o?(/^https?:\/\//i.test(o)||(o=`https://${o}`),o.replace(/\/+$/,"")):typeof window<"u"&&((t=window.location)!=null&&t.origin)?window.location.origin:""}async function ve({serverUrl:e="",sessionName:o="default",deviceName:t="Mobile Device",deviceType:i="mobile",password:s="",command:a,fetchImpl:n=typeof fetch<"u"?fetch:null}){if(!n)throw new Error("Fetch implementation is not available");const p=`${V(e)}/api/remote/session`,l=await n(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionName:o,deviceType:i,deviceName:t,password:s,command:a})});if(!l.ok)throw new Error(`Failed to send command: ${l.status} ${l.statusText}`);return l.json()}async function F({serverUrl:e="",sessionName:o="default",password:t="",since:i=0,fetchImpl:s=typeof fetch<"u"?fetch:null}){if(!s)throw new Error("Fetch implementation is not available");const a=V(e),n=new URLSearchParams({session:o,since:String(i)});t&&n.set("password",t);const u=`${a}/api/remote/session?${n.toString()}`,p=await s(u,{method:"GET",headers:{Accept:"application/json"}});if(!p.ok)throw new Error(`Failed to fetch session: ${p.status}`);return p.json()}function we(e,o=typeof window<"u"?window.__godsEyeView:null){var u,p,d,l,y,f,b;if(!e||!e.action)return!1;const{action:t,args:i={}}=e,s=(o==null?void 0:o.viewer)||((u=window.__godsEyeView)==null?void 0:u.viewer)||(typeof window<"u"?window.viewer:null),a=(o==null?void 0:o.dataManager)||((p=window.__godsEyeView)==null?void 0:p.dataManager),n=(o==null?void 0:o.sceneDirector)||((d=window.__godsEyeView)==null?void 0:d.sceneDirector);switch(console.info(`[RemoteCommand] Executing action: "${t}"`,i),t){case"zoom_to_globe":{if((l=s==null?void 0:s.camera)!=null&&l.flyTo){M("remote-globe"),k();const c=Cesium.Cartesian3.fromDegrees(0,20,2e7);s.camera.flyTo({destination:c,duration:2.5,complete:()=>{z("remote-globe"),k()},cancel:()=>{z("remote-globe"),k()}})}return!0}case"fly_to_location":{const c=Number(i.lat??i.latitude??0),r=Number(i.lon??i.longitude??0),g=Math.max(100,Number(i.height??18e3));if((y=s==null?void 0:s.camera)!=null&&y.flyTo){M("remote-fly"),k();const w=Cesium.Cartesian3.fromDegrees(r,c,g);s.camera.flyTo({destination:w,duration:2,complete:()=>{z("remote-fly"),k()},cancel:()=>{z("remote-fly"),k()}})}return!0}case"set_layer_visibility":{const c=i.layer||i.layerId,r=!!(i.enabled??i.visible??!0);return c&&(a!=null&&a.setEnabled)&&(a.setEnabled(c,r),k()),!0}case"stop":return z("remote-fly"),z("remote-globe"),n!=null&&n.stop&&n.stop(),(f=s==null?void 0:s.camera)!=null&&f.cancelFlight&&s.camera.cancelFlight(),k(),!0;case"sync_custom_locations":return!0;case"show_presentation_block":{const c=i.blockId||i.id,r=i.index;if(typeof window<"u"&&window.__selectRealismoBlock)window.__selectRealismoBlock(c??r,!0);else{const g=Number(i.lat??i.latitude??0),w=Number(i.lon??i.longitude??i.lng??0),h=Math.max(100,Number(i.height??i.alt??25e4)),C=Number(i.pitch??-45),L=Number(i.heading??0);if((b=s==null?void 0:s.camera)!=null&&b.flyTo){M("remote-fly"),k();const $=Cesium.Cartesian3.fromDegrees(w,g,h);s.camera.flyTo({destination:$,orientation:{heading:Cesium.Math.toRadians(L),pitch:Cesium.Math.toRadians(C),roll:0},duration:2,complete:()=>{z("remote-fly"),k()},cancel:()=>{z("remote-fly"),k()}})}}return!0}case"presentation_nav":{const c=i.direction||"next";return typeof window<"u"&&(c==="next"&&window.__nextRealismoBlock?window.__nextRealismoBlock(!0):c==="prev"&&window.__prevRealismoBlock&&window.__prevRealismoBlock(!0)),!0}default:return console.warn(`[Remote] Unknown action: ${t}`),!1}}function ke({sessionName:e="default",serverUrl:o="",pollInterval:t=1e3,onCommand:i,fetchImpl:s=typeof fetch<"u"?fetch:null,app:a=typeof window<"u"?window.__godsEyeView:null}={}){let n=Date.now()-5e3,u=Date.now(),p=!1,d=null;function l(){if(typeof e=="function"){const f=e();if(f&&String(f).trim().length>=4)return String(f).trim()}return typeof e=="string"&&e.trim().length>=4?e.trim():A()}async function y(){var f;if(!p)try{const b=l(),c=await F({serverUrl:o,sessionName:b,since:n,fetchImpl:s});if(c!=null&&c.sessionName&&c.sessionName!==b&&typeof N=="function")try{N(c.sessionName)}catch{}if((f=c==null?void 0:c.commands)!=null&&f.length){u=Date.now();for(const r of c.commands)r.timestamp>n&&(n=r.timestamp,we(r,a||window.__godsEyeView),typeof i=="function"&&i(r))}}catch{}finally{if(!p){const b=typeof document<"u"&&document.hidden,c=Date.now()-u>4e3;let r=t;b?r=5e3:c?r=Math.max(t,2500):r=t,d=setTimeout(y,r)}}}return d=setTimeout(y,t),()=>{p=!0,d&&clearTimeout(d)}}const Y=[{name:"Nueva York",lat:40.7128,lon:-74.006,height:18e3},{name:"Tokio",lat:35.6762,lon:139.6503,height:18e3},{name:"Londres",lat:51.5074,lon:-.1278,height:18e3},{name:"París",lat:48.8566,lon:2.3522,height:18e3},{name:"San Francisco",lat:37.7749,lon:-122.4194,height:18e3},{name:"Austin",lat:30.2672,lon:-97.7431,height:18e3}],Se=[{id:"flights",label:"✈️ Vuelos en vivo"},{id:"vessels",label:"🚢 Buques (AIS)"},{id:"satellites",label:"🛰️ Satélites"},{id:"cctv",label:"📷 Cámaras CCTV"},{id:"firms",label:"🔥 Incendios (FIRMS)"},{id:"earthquakes",label:"⚡ Terremotos"},{id:"traffic",label:"🚗 Tráfico"}];function Ce(e=document.body,o={}){const t=document.getElementById("loading-screen");t&&(t.style.display="none");const i=document.getElementById("cesiumContainer");i&&(i.style.display="none");const s=new URLSearchParams(window.location.search);let a=localStorage.getItem("gev_shared_user_code")||localStorage.getItem("gev_remote_user")||o.deviceName||"user1234",n=s.get("session")||a||"user1234",u=localStorage.getItem("gev_remote_server")||o.serverUrl||window.location.origin,p=localStorage.getItem("gev_active_preset_password")||"",d=R(p);const l=document.createElement("div");l.id="gev-mobile-remote-app",l.style.cssText=`
    position: fixed; inset: 0; background: #070a11; color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace, -apple-system, sans-serif;
    display: flex; flex-direction: column; overflow-y: auto; z-index: 99999;
    padding: 16px; box-sizing: border-box; -webkit-tap-highlight-color: transparent;
  `;function y(){l.innerHTML=`
      <div style="max-width: 480px; margin: auto; width: 100%; display: flex; flex-direction: column; gap: 16px;">
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; letter-spacing: 2px; color: #00e5ff; text-transform: uppercase;">God's Eye View</div>
          <h1 style="font-size: 22px; margin: 4px 0 8px; color: #fff;">Control Remoto Móvil</h1>
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            Conecta tu teléfono como mando introduciendo el usuario de tu PC (mínimo 4 caracteres) y opcionalmente tu contraseña de destinos.
          </p>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              Nombre de Usuario / Código PC (Mín. 4 caracteres)
            </label>
            <input id="gev-input-user" type="text" value="${b(a)}" placeholder="Mínimo 4 caracteres (ej. user1234)"
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <div id="gev-user-error" style="font-size: 11px; color: #f87171; margin-top: 4px; display: none;"></div>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              Contraseña de Destinos (Opcional)
            </label>
            <input id="gev-input-password" type="text" value="${b(p)}" placeholder="Ej: alfa1234, tactical2026, ciudades99..."
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">
              Cada contraseña carga un conjunto de destinos preestablecidos diferente.
            </span>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              URL Servidor / Túnel PC
            </label>
            <input id="gev-input-server" type="text" value="${b(u)}" placeholder="https://...devtunnels.ms"
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">
              Si usas un túnel de VS Code o ngrok en la PC, escribe la dirección aquí.
            </span>
          </div>

          <button id="gev-btn-enter" style="
            margin-top: 6px; background: #0284c7; color: #fff; border: none;
            border-radius: 6px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer;
            letter-spacing: 0.5px; transition: background 0.2s;
          ">
            Entrar al control
          </button>
        </div>
      </div>
    `,l.querySelector("#gev-btn-enter").addEventListener("click",async()=>{var C;const c=l.querySelector("#gev-input-user").value.trim(),r=l.querySelector("#gev-input-password").value.trim(),g=l.querySelector("#gev-input-server").value.trim()||window.location.origin,w=l.querySelector("#gev-user-error"),h=G(c);if(!h.valid){w.textContent=h.error,w.style.display="block";return}a=c,n=c,p=r,u=V(g),localStorage.setItem("gev_shared_user_code",a),localStorage.setItem("gev_remote_user",a),localStorage.setItem("gev_remote_session",n),localStorage.setItem("gev_remote_server",u),localStorage.setItem("gev_active_preset_password",p),d=R(p);try{const L=await F({serverUrl:u,sessionName:n,password:p});(C=L==null?void 0:L.customLocations)!=null&&C.length&&(d=L.customLocations)}catch{}f()})}function f(){var $,J;l.innerHTML=`
      <div style="max-width: 480px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
              <span style="font-size: 13px; font-weight: 600; color: #fff;">Usuario: ${b(a)}</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              Perfil Clave: <strong id="gev-active-pass-badge" style="color: #38bdf8;">${b(p||"(General)")}</strong>
            </div>
          </div>
          <button id="gev-btn-settings" style="background: transparent; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;">
            ⚙️ Ajustes
          </button>
        </div>

        <!-- Status log -->
        <div id="gev-status-log" style="font-size: 11px; color: #00e5ff; background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.2); border-radius: 6px; padding: 8px 12px; min-height: 18px; text-align: center;">
          Conectado. Listo para controlar la PC.
        </div>

        <!-- Mando de la Exposición Escolar: El Realismo en la Literatura -->
        <div style="background: linear-gradient(135deg, rgba(2,132,199,0.22) 0%, rgba(15,23,42,0.96) 100%); border: 1.5px solid #0284c7; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 24px rgba(2,132,199,0.25);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 10px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; text-transform: uppercase;">
                🎓 Exposición: El Realismo en la Literatura
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-top: 2px;">
                Juan David De Avila Delgado
              </div>
              <div style="font-size: 10.5px; color: #94a3b8; margin-top: 1px;">
                Toca un bloque para volar en 3D y proyectar datos
              </div>
            </div>
            <span style="background: #0284c7; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
              ${_.length} Hitos 3D
            </span>
          </div>

          <!-- Botones de los 10 Hitos Geográficos -->
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; padding-right: 2px;">
            ${_.map((m,x)=>`
              <button class="btn-realismo-block" data-idx="${x}" data-id="${m.id}" style="
                background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 8px;
                padding: 10px 12px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left;
                display: flex; justify-content: space-between; align-items: center; transition: all 0.15s;
              ">
                <span style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 15px;">${["🗼","🐎","🏛️","⚔️","🚂","🌿","🏔️","🚢","🏙️","🌾"][x]||"📍"}</span>
                  <span>${b(m.buttonLabel)}</span>
                </span>
                <span class="fly-indicator" style="font-size: 11px; color: #38bdf8; font-family: monospace;">Volar ➔</span>
              </button>
            `).join("")}
          </div>

          <!-- Navegación Anterior / Siguiente -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <button id="btn-mobile-prev-block" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 6px; padding: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer;">
              ◀ Anterior
            </button>
            <button id="btn-mobile-next-block" style="background: #0284c7; border: 1px solid #38bdf8; color: #ffffff; border-radius: 6px; padding: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer;">
              Siguiente ▶
            </button>
          </div>
        </div>

        <!-- Password Switcher Section -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600; margin-bottom: 6px;">
            🔑 Cargar Destinos por Contraseña
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <input id="gev-mobile-pass-input" type="text" value="${b(p)}" placeholder="Escribe contraseña..."
              style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 12px; font-family: inherit;" />
            <button id="gev-mobile-btn-apply-pass" style="background: #0284c7; color: #fff; border: none; border-radius: 6px; padding: 8px 12px; font-size: 11px; font-weight: 600; cursor: pointer;">
              Cargar
            </button>
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn-fast-pass" data-pass="alfa1234" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 alfa1234</button>
            <button class="btn-fast-pass" data-pass="tactical2026" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 tactical2026</button>
            <button class="btn-fast-pass" data-pass="ciudades99" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 ciudades99</button>
          </div>
        </div>

        <!-- Camera Controls -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Control de Cámara
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-zoom-globe" style="background: #1e293b; border: 1px solid #334155; color: #38bdf8; border-radius: 6px; padding: 12px; font-size: 13px; font-weight: 600; cursor: pointer;">
              🌍 Vista Global
            </button>
            <button id="btn-stop" style="background: #1e293b; border: 1px solid #334155; color: #f87171; border-radius: 6px; padding: 12px; font-size: 13px; font-weight: 600; cursor: pointer;">
              ⏹️ Detener
            </button>
          </div>
        </div>

        <!-- Custom Destinations Loaded by Password -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600;">
              ⭐ Destinos del Perfil Activo
            </div>
            <button id="gev-btn-refresh-custom-dest" style="background: #0369a1; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
              🔄 Sincronizar
            </button>
          </div>
          <div id="gev-custom-destinations-container" style="display: flex; flex-direction: column; gap: 6px;">
          </div>
        </div>

        <!-- Global Preset Locations -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Destinos Rápidos Globales
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${Y.map((m,x)=>`
              <button class="btn-location" data-index="${x}" style="background: #1e293b; border: 1px solid #334155; color: #f1f5f9; border-radius: 6px; padding: 10px; font-size: 12px; cursor: pointer; text-align: left;">
                📍 ${b(m.name)}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Layer Toggles -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Capas del Mapa
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${Se.map(m=>`
              <div style="display: flex; justify-content: space-between; align-items: center; background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px;">
                <span style="font-size: 13px; color: #e2e8f0;">${b(m.label)}</span>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-layer-on" data-layer="${b(m.id)}" style="background: #064e3b; border: 1px solid #059669; color: #34d399; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">ON</button>
                  <button class="btn-layer-off" data-layer="${b(m.id)}" style="background: #450a0a; border: 1px solid #dc2626; color: #f87171; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">OFF</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;const c=l.querySelector("#gev-status-log");function r(m,x=!1){c&&(c.textContent=m,c.style.color=x?"#f87171":"#00e5ff",c.style.borderColor=x?"rgba(248,113,113,0.3)":"rgba(0,229,255,0.2)")}async function g(m,x={}){try{r(`Enviando: ${m}...`),await ve({serverUrl:u,sessionName:n,deviceName:a,password:p,command:{action:m,args:x}}),r(`✅ Ejecutado en PC: ${m}`)}catch(v){r(`❌ Error al enviar: ${v.message}`,!0)}}function w(){const m=l.querySelector("#gev-custom-destinations-container"),x=l.querySelector("#gev-active-pass-badge");if(x&&(x.textContent=p||"(General)"),!!m){if(!d.length){m.innerHTML=`
          <div style="font-size: 11px; color: #64748b; text-align: center; padding: 8px;">
            No hay destinos para la contraseña "${b(p||"General")}".
            Puedes guardarlos desde la PC o usar una contraseña como <strong>alfa1234</strong> o <strong>tactical2026</strong>.
          </div>
        `;return}m.innerHTML=d.map(v=>`
        <button class="btn-custom-dest" data-lat="${v.lat}" data-lon="${v.lon}" data-height="${v.height||15e3}" style="
          background: #1e293b; border: 1px solid #0284c7; color: #f8fafc; border-radius: 6px;
          padding: 10px 12px; font-size: 12px; cursor: pointer; text-align: left; display: flex;
          justify-content: space-between; align-items: center;
        ">
          <span>⭐ ${b(v.name)}</span>
          <span style="font-size: 10px; color: #38bdf8;">Volar ➔</span>
        </button>
      `).join(""),m.querySelectorAll(".btn-custom-dest").forEach(v=>{v.addEventListener("click",()=>{const E=Number(v.getAttribute("data-lat")),ie=Number(v.getAttribute("data-lon")),ae=Number(v.getAttribute("data-height"));g("fly_to_location",{lat:E,lon:ie,height:ae})})})}}async function h(m){var x;p=String(m??"").trim().toLowerCase(),localStorage.setItem("gev_active_preset_password",p),j(p),d=R(p),w(),r(`Cargando perfil para contraseña "${p||"General"}"...`);try{const v=await F({serverUrl:u,sessionName:n,password:p});(x=v==null?void 0:v.customLocations)!=null&&x.length&&(d=v.customLocations,w()),r(`✅ Perfil "${p||"General"}" cargado (${d.length} destinos).`)}catch{r(`✅ Destinos locales cargados (${d.length}).`)}}w(),l.querySelector("#gev-btn-settings").addEventListener("click",y),l.querySelector("#btn-zoom-globe").addEventListener("click",()=>g("zoom_to_globe")),l.querySelector("#btn-stop").addEventListener("click",()=>g("stop")),l.querySelector("#gev-btn-refresh-custom-dest").addEventListener("click",()=>h(p));let C=0;const L=m=>{C=(m+_.length)%_.length,l.querySelectorAll(".btn-realismo-block").forEach(x=>{const v=Number(x.getAttribute("data-idx")),E=x.querySelector(".fly-indicator");v===C?(x.style.background="#0369a1",x.style.borderColor="#38bdf8",x.style.boxShadow="0 0 12px rgba(56, 189, 248, 0.35)",E&&(E.textContent="● En pantalla")):(x.style.background="#0f172a",x.style.borderColor="#334155",x.style.boxShadow="none",E&&(E.textContent="Volar ➔"))})};L(0),l.querySelectorAll(".btn-realismo-block").forEach(m=>{m.addEventListener("click",()=>{const x=Number(m.getAttribute("data-idx")),v=m.getAttribute("data-id"),E=_[x];L(x),navigator.vibrate&&navigator.vibrate(35),g("show_presentation_block",{blockId:v,index:x,lat:E.coordinates.lat,lng:E.coordinates.lng,lon:E.coordinates.lng,alt:E.coordinates.alt,height:E.coordinates.alt,pitch:E.coordinates.pitch,heading:E.coordinates.heading}),r(`✔ Proyectando: ${E.buttonLabel}`)})}),($=l.querySelector("#btn-mobile-prev-block"))==null||$.addEventListener("click",()=>{L(C-1),navigator.vibrate&&navigator.vibrate(25),g("presentation_nav",{direction:"prev"}),r("✔ Diapositiva anterior en PC")}),(J=l.querySelector("#btn-mobile-next-block"))==null||J.addEventListener("click",()=>{L(C+1),navigator.vibrate&&navigator.vibrate(25),g("presentation_nav",{direction:"next"}),r("✔ Diapositiva siguiente en PC")}),l.querySelector("#gev-mobile-btn-apply-pass").addEventListener("click",()=>{const m=l.querySelector("#gev-mobile-pass-input").value.trim();h(m)}),l.querySelectorAll(".btn-fast-pass").forEach(m=>{m.addEventListener("click",()=>{const x=m.getAttribute("data-pass");l.querySelector("#gev-mobile-pass-input").value=x,h(x)})}),l.querySelectorAll(".btn-location").forEach(m=>{m.addEventListener("click",()=>{const x=Number(m.getAttribute("data-index")),v=Y[x];v&&g("fly_to_location",{lat:v.lat,lon:v.lon,height:v.height})})}),l.querySelectorAll(".btn-layer-on").forEach(m=>{m.addEventListener("click",()=>{const x=m.getAttribute("data-layer");g("set_layer_visibility",{layer:x,enabled:!0})})}),l.querySelectorAll(".btn-layer-off").forEach(m=>{m.addEventListener("click",()=>{const x=m.getAttribute("data-layer");g("set_layer_visibility",{layer:x,enabled:!1})})}),p&&h(p)}function b(c){return String(c??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}return y(),e.appendChild(l),{destroy(){l.parentNode&&l.parentNode.removeChild(l)}}}function _e({viewer:e,container:o=document.body}={}){let t=0,i=!1,s=null,a=null;const n=document.createElement("div");n.id="gev-realismo-presentation-panel",n.style.cssText=`
    position: fixed;
    top: 20px;
    right: 20px;
    width: 460px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 36px);
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 14px;
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.15);
    color: #f8fafc;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;function u(r){if(!(!(e!=null&&e.entities)||!(r!=null&&r.coordinates)))try{a&&(e.entities.remove(a),a=null),a=e.entities.add({position:Cesium.Cartesian3.fromDegrees(r.coordinates.lng,r.coordinates.lat,0),point:{pixelSize:14,color:Cesium.Color.fromCssColorString("#38bdf8"),outlineColor:Cesium.Color.WHITE,outlineWidth:2,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND},label:{text:`📍 ${r.buttonLabel.split("—")[0].trim()}`,font:"13px JetBrains Mono, monospace",fillColor:Cesium.Color.WHITE,showBackground:!0,backgroundColor:Cesium.Color.fromCssColorString("rgba(15, 23, 42, 0.9)"),backgroundPadding:new Cesium.Cartesian2(8,5),verticalOrigin:Cesium.VerticalOrigin.BOTTOM,pixelOffset:new Cesium.Cartesian2(0,-14),heightReference:Cesium.HeightReference.CLAMP_TO_GROUND}}),k("marker-update")}catch(g){console.warn("Marker error:",g)}}function p(r){if(!(!(e!=null&&e.camera)||!(r!=null&&r.coordinates)))try{M("presentation-fly"),k("fly-start"),u(r);const g=r.coordinates,w=Cesium.Math.toRadians(g.heading??0),h=Cesium.Math.toRadians(g.pitch??-45);e.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(g.lng,g.lat,g.alt||22e4),orientation:{heading:w,pitch:h,roll:0},duration:2.2,complete:()=>{z("presentation-fly"),k("fly-complete")},cancel:()=>{z("presentation-fly"),k("fly-cancel")}})}catch(g){console.warn("Fly-to error:",g),z("presentation-fly")}}function d(){const r=_[t],g=_.length,w=(A==null?void 0:A())||"user1234";if(i){n.style.width="auto",n.style.maxHeight="none",n.innerHTML=`
        <div style="padding: 10px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" id="btn-maximize-presentation">
          <span style="font-size: 18px;">📖</span>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">
              El Realismo Literario (${t+1}/${g})
            </div>
            <div style="font-size: 12px; color: #f8fafc; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">
              ${r.buttonLabel}
            </div>
          </div>
          <button style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Expandir ↗
          </button>
        </div>
      `,n.querySelector("#btn-maximize-presentation").onclick=()=>{i=!1,n.style.width="460px",n.style.maxHeight="calc(100vh - 36px)",d()};return}n.innerHTML=`
      <!-- Cabecera -->
      <div style="padding: 14px 18px 12px; background: rgba(30, 41, 59, 0.75); border-bottom: 1px solid rgba(51, 65, 85, 0.6); display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; text-transform: uppercase;">
              Ray's Eye View • 3D
            </span>
          </div>
          <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc; line-height: 1.25;">
            El Realismo en la Literatura
          </h2>
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">
            Por <span style="color: #cbd5e1; font-weight: 600;">Juan David De Avila Delgado</span>
          </div>
        </div>
        <button id="btn-minimize-presentation" title="Minimizar panel" style="background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(100, 116, 139, 0.4); color: #cbd5e1; border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.15s;">
          _
        </button>
      </div>

      <!-- Barra deslizable con proporciones reajustadas para los 10 botones de hitos -->
      <div style="height: 103.9px; box-sizing: border-box; display: flex; gap: 6px; padding: 8px 12px; background: rgba(15, 23, 42, 0.9); border-bottom: 1px solid rgba(51, 65, 85, 0.4); overflow-x: auto; scrollbar-width: thin;">
        ${_.map((h,C)=>`
          <button class="nav-stage-btn" data-idx="${C}" style="
            flex: 0 0 auto; height: 28px; padding: 0 11px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer;
            border: 1px solid ${C===t?"#38bdf8":"rgba(51, 65, 85, 0.6)"};
            background: ${C===t?"rgba(56, 189, 248, 0.22)":"rgba(30, 41, 59, 0.5)"};
            color: ${C===t?"#38bdf8":"#cbd5e1"};
            white-space: nowrap; text-align: center; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
          ">
            ${C+1}. ${h.buttonLabel.split("—")[0].replace(/^\d+\.\s*/,"")}
          </button>
        `).join("")}
      </div>

      <!-- Contenido del Hito / Diapositiva -->
      <div style="padding: 14px 18px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin;">
        
        <!-- Bloque de Título y Ubicación -->
        <div style="border-left: 3px solid #38bdf8; padding-left: 12px;">
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #38bdf8; text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">
            Hito ${t+1} de ${g} • ${r.subtitle}
          </div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff; line-height: 1.3;">
            ${r.title}
          </h3>
        </div>

        <!-- Descripción / Detalles -->
        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(51, 65, 85, 0.5); border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">
            📌 Contexto y Características
          </div>
          <p style="margin: 0; font-size: 12.5px; color: #cbd5e1; line-height: 1.5;">
            ${r.details}
          </p>
        </div>

        <!-- Autores y Obras Clave -->
        ${r.authorsAndWorks&&r.authorsAndWorks.length>0?`
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
              📚 Autores y Obras Clave
            </div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #f1f5f9; display: flex; flex-direction: column; gap: 4px;">
              ${r.authorsAndWorks.map(h=>`
                <li style="line-height: 1.4;">
                  <strong>${h.split("—")[0]}</strong> ${h.includes("—")?"— <em>"+h.split("—")[1]+"</em>":""}
                </li>
              `).join("")}
            </ul>
          </div>
        `:""}

        <!-- Vínculo con Europa / Modelo -->
        ${r.relationToEurope?`
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 9px 12px; font-size: 12px; color: #93c5fd; line-height: 1.4;">
            <strong style="color: #38bdf8;">Vínculo con Europa:</strong> ${r.relationToEurope}
          </div>
        `:""}

        <!-- Galería de Imágenes Reales Wikimedia Special:FilePath -->
        ${r.images&&r.images.length>0?`
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
              🖼️ Retratos y Documentos Históricos (${r.images.length})
            </div>
            <div style="display: grid; grid-template-columns: repeat(${Math.min(r.images.length,2)}, 1fr); gap: 8px;">
              ${r.images.map((h,C)=>`
                <div class="presentation-img-thumb" data-src="${h}" style="
                  height: 120px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px solid rgba(56, 189, 248, 0.35);
                  background: #0f172a; position: relative; transition: transform 0.15s, border-color 0.15s;
                ">
                  <img
                    src="${h}"
                    alt="Archivo histórico ${C+1}"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    style="width: 100%; height: 100%; object-fit: cover; display: block;"
                    onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect width=%22120%22 height=%22120%22 fill=%22%231e293b%22/><text x=%2250%%22 y=%2245%%22 fill=%22%2338bdf8%22 font-size=%2222%22 text-anchor=%22middle%22 dy=%22.3em%22>📖</text><text x=%2250%%22 y=%2270%%22 fill=%22%2394a3b8%22 font-size=%2210%22 text-anchor=%22middle%22>Ver archivo</text></svg>';"
                  />
                  <div style="position: absolute; bottom: 0; inset-inline: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(2px); font-size: 9.5px; color: #cbd5e1; padding: 3px 6px; text-align: center;">
                    🔍 Clic para ampliar
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `:""}

        <!-- Botón de Vuelo 3D Cinemático -->
        <button id="btn-fly-current-stage" style="
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 1px solid #38bdf8;
          color: #ffffff;
          border-radius: 8px;
          height: 38px;
          padding: 0 14px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
          transition: all 0.2s;
        ">
          <span>🚀</span>
          <span>Centrar cámara 3D en ${r.buttonLabel.split("—")[0].replace(/^\d+\.\s*/,"")} (Pitch -45°)</span>
        </button>

        <!-- Indicador de control remoto móvil -->
        <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8;">
          <span>📱 Control Remoto Celular:</span>
          <span style="font-family: 'JetBrains Mono', monospace; color: #38bdf8; font-weight: 600; background: rgba(56, 189, 248, 0.1); padding: 2px 8px; border-radius: 4px;">
            Código: ${w}
          </span>
        </div>

      </div>

      <!-- Barra de Botones Inferior: Anterior / Siguiente con proporciones equilibradas -->
      <div style="padding: 12px 18px; background: rgba(30, 41, 59, 0.75); border-top: 1px solid rgba(51, 65, 85, 0.6); display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <button id="btn-presentation-prev" style="
          flex: 1; height: 36px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(71, 85, 105, 0.8); color: #cbd5e1;
          border-radius: 6px; padding: 0 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s;
        ">
          ◀ Anterior
        </button>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #94a3b8; font-weight: 600; min-width: 60px; text-align: center;">
          ${t+1} / ${g}
        </span>
        <button id="btn-presentation-next" style="
          flex: 1; height: 36px; background: #0284c7; border: 1px solid #38bdf8; color: #ffffff;
          border-radius: 6px; padding: 0 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s;
        ">
          Siguiente ▶
        </button>
      </div>
    `,n.querySelector("#btn-minimize-presentation").onclick=()=>{i=!0,d()},n.querySelectorAll(".nav-stage-btn").forEach(h=>{h.onclick=()=>{const C=Number(h.getAttribute("data-idx"));y(C,!0)}}),n.querySelector("#btn-fly-current-stage").onclick=()=>{p(_[t])},n.querySelector("#btn-presentation-prev").onclick=()=>{b(!0)},n.querySelector("#btn-presentation-next").onclick=()=>{f(!0)},n.querySelectorAll(".presentation-img-thumb").forEach(h=>{h.onclick=()=>{const C=h.getAttribute("data-src");l(C)}})}function l(r){s&&s.remove();const g=document.createElement("div");g.style.cssText=`
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.88); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; z-index: 100000; cursor: pointer; padding: 16px;
    `,g.innerHTML=`
      <div style="max-width: 90vw; max-height: 90vh; position: relative;">
        <img
          src="${r}"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          style="max-width: 88vw; max-height: 85vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.95); border: 1.5px solid rgba(56, 189, 248, 0.6); object-fit: contain;"
        />
        <div style="position: absolute; top: -12px; right: -12px; background: #ef4444; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: monospace; box-shadow: 0 2px 8px rgba(0,0,0,0.5);">✕</div>
      </div>
    `,g.onclick=()=>g.remove(),document.body.appendChild(g),s=g}function y(r,g=!0){let w=-1;typeof r=="number"?w=r:w=_.findIndex(h=>h.id===r),w<0&&(w=0),w>=_.length&&(w=_.length-1),t=w,d(),g&&p(_[t])}function f(r=!0){const g=(t+1)%_.length;y(g,r)}function b(r=!0){const g=(t-1+_.length)%_.length;y(g,r)}const c=r=>{r.target.tagName==="INPUT"||r.target.tagName==="TEXTAREA"||(r.key==="ArrowRight"||r.key==="PageDown"?f(!0):(r.key==="ArrowLeft"||r.key==="PageUp")&&b(!0))};return window.addEventListener("keydown",c),window.__selectRealismoBlock=(r,g=!0)=>y(r,g),window.__nextRealismoBlock=(r=!0)=>f(r),window.__prevRealismoBlock=(r=!0)=>b(r),o.appendChild(n),d(),setTimeout(()=>{p(_[0])},1e3),{selectBlock:y,nextBlock:f,prevBlock:b,destroy(){window.removeEventListener("keydown",c),n.remove(),a&&(e!=null&&e.entities)&&e.entities.remove(a),s&&s.remove(),delete window.__selectRealismoBlock,delete window.__nextRealismoBlock,delete window.__prevRealismoBlock}}}let X=null;he()?Ce():(X=ue({googleApiKey:void 0,cesiumToken:void 0,allowQaRegistration:!1}),X.start().then(()=>{var s,a;const e=new URLSearchParams(window.location.search),o=typeof A=="function"?A():"user1234",t=e.get("session")||o||"user1234";ke({sessionName:t,app:window.__godsEyeView}),(s=window.__godsEyeView)!=null&&s.viewer&&ye(window.__godsEyeView.viewer);const i=_e({viewer:(a=window.__godsEyeView)==null?void 0:a.viewer});window.__realismoPresentation=i,window.__selectRealismoBlock=(n,u)=>i.selectBlock(n,u),window.__nextRealismoBlock=n=>i.nextBlock(n),window.__prevRealismoBlock=n=>i.prevBlock(n)}).catch(e=>{console.error("God's Eye View initialization failed:",e);const o=document.querySelector("#loading-screen .loader-status");o&&(o.textContent=`Error: ${ge(e)}`,o.style.color="#ff4444")}));
