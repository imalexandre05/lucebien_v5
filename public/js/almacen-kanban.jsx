/* ═══════════════════════════════════════════════════════════════════════
   LUCEBIEN · almacen-kanban.jsx
   Componente principal de "Prendas Recibidas" (almacén).
   - Lógica intacta respecto a la versión anterior (mismos estados,
     callbacks y endpoints).
   - Render reescrito con clases CSS de kanban-almacen.css (sin estilos
     inline) y paleta navy/gold del sistema.
   - Toolbar de acción ahora es sticky bajo el nav (antes fixed-bottom),
     resuelve la queja de tener que scrollear para llegar a los botones.
   ═══════════════════════════════════════════════════════════════════════ */
const ETAPAS=['recepcion','lavado','empatado','refaccion','compostura','planchado','control_calidad','listo'];
const ET_L={recepcion:'Recepción',lavado:'Lavado',empatado:'Empatado',refaccion:'Refacción',compostura:'Compostura',planchado:'Planchado',control_calidad:'Control Calidad',listo:'Listo p/ Envío'};
const ET_I={recepcion:'📥',lavado:'🧼',empatado:'🔗',refaccion:'🧵',compostura:'✂️',planchado:'👔',control_calidad:'✅',listo:'📦'};
const NEXT={recepcion:'lavado',lavado:'empatado',empatado:'refaccion',refaccion:'planchado',compostura:'planchado',planchado:'control_calidad'};
const LC={normal:{cls:'kbn-pill-blue',l:'Normal'},seco:{cls:'kbn-pill-yellow',l:'Seco'},especializado:{cls:'kbn-pill-purple',l:'Especial.'}};
const SEDES_E=[{c:'ST',l:'Stan 101-102'},{c:'LB',l:'LuceBien'},{c:'TR',l:'Trece'}];
const ACC_T=['Camisas','Corbatas','Michis','Corbatones','Pantalones sueltos'];
const COL_MAP={"Negro":"#1a1a1a","Azul noche":"#1e2a4a","Azul Barcelona":"#004d98","Azul eléctrico":"#0066ff","Azul acero":"#4682b4","Azul presidente":"#1e3a5f","Verde petróleo":"#006666","Celeste":"#87ceeb","Celeste bb":"#b0e0e6","Plomo":"#808080","Plomo rata":"#6b6b6b","Beige":"#d4b896","Camello":"#c19a6b","Vino":"#722f37","Blanco":"#f5f5f5","Gris":"#999","Otros":"#aaa"};
const{useState,useEffect,useRef,useCallback}=React;

async function apiG(p){try{var t=localStorage.getItem('lb_kanban_token')||localStorage.getItem('lb_token');var h=t?{'Authorization':'Bearer '+t}:undefined;var r=await fetch('/api'+p,h?{headers:h}:undefined);if(!r.ok)return null;return r.json();}catch(e){return null;}}
async function apiW(m,p,b){var t=localStorage.getItem('lb_kanban_token');if(!t)return{error:'Ingresa código'};try{var r=await fetch('/api'+p,{method:m,headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify(b)});var tx=await r.text();var d;try{d=JSON.parse(tx);}catch(e){return{error:'Error: '+tx.substring(0,60)};}if(!r.ok)return{error:d.error||'Error '+r.status};return d;}catch(e){return{error:'Red: '+e.message};}}

function KanbanApp(){
  const[opC,setOpC]=useState('');const[opN,setOpN]=useState('');const[opOk,setOpOk]=useState(false);const[isAdm,setIsAdm]=useState(false);
  const[tab,setTab]=useState('kanban');const[kb,setKb]=useState({});const[sel,setSel]=useState([]);
  const[tandas,setTandas]=useState({});const[slog,setSlog]=useState([]);
  const[accT,setAccT]=useState(ACC_T[0]);const[accN,setAccN]=useState('');const[accSust,setAccSust]=useState('');const[accOrigen,setAccOrigen]=useState('tienda');
  const[toast,setToast]=useState(null);const[tErr,setTErr]=useState(false);const[busy,setBusy]=useState(false);
  const[rejM,setRejM]=useState(null);const[rejD,setRejD]=useState('recepcion');const[rejO,setRejO]=useState('');
  const[tLav,setTLav]=useState('normal');const[envM,setEnvM]=useState(false);const[envD,setEnvD]=useState('');
  const[splitM,setSplitM]=useState(null);const[splitLavS,setSplitLavS]=useState('normal');const[splitLavP,setSplitLavP]=useState('normal');
  const[fSede,setFSede]=useState('');const[fLav,setFLav]=useState('');const[searchQ,setSearchQ]=useState('');
  const[cfgPts,setCfgPts]=useState({});const[accHoy,setAccHoy]=useState([]);const[sts,setSts]=useState({});const[accRec,setAccRec]=useState({});
  const[ranking,setRanking]=useState([]);const[bita,setBita]=useState([]);
  const tR=useRef(null);const[undoData,setUndoData]=useState(null);const undoTimer=useRef(null);
  const[myProg,setMyProg]=useState({pts:0,acciones:0,detalle:[]});const[diario,setDiario]=useState(null);
  const[regItems,setRegItems]=useState([]);const[regBusy,setRegBusy]=useState(false);
  // ── Estado del tab "Envíos a tienda" (accesorios) ──
  const[eaDest,setEaDest]=useState('');const[eaFecha,setEaFecha]=useState('');
  const[eaCorbatas,setEaCorbatas]=useState(0);const[eaMichis,setEaMichis]=useState(0);const[eaCorbatones,setEaCorbatones]=useState(0);
  const[eaCamisas,setEaCamisas]=useState(0);const[eaZapatos,setEaZapatos]=useState(0);const[eaPortas,setEaPortas]=useState(0);
  const[eaObs,setEaObs]=useState('');const[eaList,setEaList]=useState([]);const[eaBusy,setEaBusy]=useState(false);
  // ── Estado del tab "Historial" ──
  const[phF,setPhF]=useState({desde:'',hasta:'',sede:'',tipo:'',responsable:'',sort:'fecha_desc'});
  const[phData,setPhData]=useState(null);const[phLoading,setPhLoading]=useState(false);
  const[phTraza,setPhTraza]=useState(null);const phDebounceRef=useRef(null);

  function valOp(c){setOpC(c);if(c.length<4){setOpN('');setOpOk(false);setIsAdm(false);setMyProg({pts:0,acciones:0,detalle:[]});return;}
    fetch('/api/auth/login-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cod:c,sede:'AL'})}).then(function(r){return r.json()}).then(function(d){if(d&&d.token){localStorage.setItem('lb_kanban_token',d.token);setOpN(d.user.nombre);setOpOk(true);setIsAdm(d.user.rol==='admin'||d.user.rol==='dueno');apiG('/pipeline/mi-avance?cod='+c).then(function(a){if(a)setMyProg(a);});}else{setOpN('—');setOpOk(false);setIsAdm(false);}}).catch(function(){setOpN('');setOpOk(false);setIsAdm(false);});}

  var load=useCallback(function(){return apiG('/pipeline/kanban').then(function(d){if(!d)return;setKb(d.kanban||{});setCfgPts(d.config_pts||{});setAccHoy(d.accesorios_hoy||[]);setSts(d.stats||{});setAccRec(d.pendientes_generales||{});});},[]);
  // Auto-login para admin/dueño/encargado_almacen: hereda la sesión del login principal
  function esSupervisorSesion(){try{var u=window.STATE&&window.STATE.user;if(!u)return false;var rol=(u.rol||'').toLowerCase();return rol==='admin'||rol==='dueno'||rol==='dueño'||rol==='encargado_almacen';}catch(e){return false;}}
  useEffect(function(){try{if(!esSupervisorSesion())return;var u=window.STATE.user;var tok=localStorage.getItem('lb_token');if(tok)localStorage.setItem('lb_kanban_token',tok);setOpC(u.cod||'admin');setOpN(u.nombre||u.rol);setOpOk(true);setIsAdm(true);apiG('/pipeline/mi-avance?cod='+(u.cod||'')).then(function(a){if(a)setMyProg(a);});}catch(e){}},[]);

  // ── Live updates via SSE + polling de respaldo ──
  // El stream emite eventos en cada acción (avanzar/rechazar/enviar/etc).
  // Cuando llega un evento que NO es nuestro, mostramos toast con el actor
  // y refrescamos. El polling cada 30s es fallback por si el stream se cae.
  var opCRef=useRef('');opCRef.current=opC;
  useEffect(function(){
    var es=null; var pollIv=null;
    function connect(){
      try{
        var tk=localStorage.getItem('lb_kanban_token')||localStorage.getItem('lb_token')||'';
        var url='/api/pipeline/stream'+(tk?'?token='+encodeURIComponent(tk):'');
        es=new EventSource(url);
        var refresh=function(label){return function(ev){
          try{
            var d=ev.data?JSON.parse(ev.data):{};
            // Toast solo si el actor es DISTINTO al operario actual (B3 evita confusión)
            if(d.cod && d.cod!==opCRef.current && d.responsable){
              var ref=d.codigo?(' '+d.codigo):(d.envio_id?(' #'+d.envio_id):'');
              fl(d.responsable+': '+label+ref);
            }
          }catch(e){}
          load();
        };}
        es.addEventListener('prenda-avanzada',     refresh('avanzó'));
        es.addEventListener('prenda-rechazada',    refresh('rechazó'));
        es.addEventListener('prenda-deshecha',     refresh('deshizo'));
        es.addEventListener('prenda-dividida',     refresh('dividió'));
        es.addEventListener('envio-creado',        refresh('envió'));
        es.addEventListener('envio-calificado',    refresh('calificó envío'));
        es.addEventListener('prendas-registradas', refresh('registró prendas'));
        es.addEventListener('accesorio-registrado',refresh('registró accesorio'));
        es.addEventListener('accesorio-extra-pendiente',refresh('accesorio pendiente'));
        es.addEventListener('envio-accesorios-creado',  refresh('envió accesorios'));
        es.addEventListener('envio-accesorios-validado',refresh('validó accesorios'));
        es.onerror=function(){ /* EventSource intenta reconectar solo (retry: 5000 del server) */ };
      }catch(e){ console.warn('SSE no disponible:',e.message); }
    }
    connect();
    load();
    pollIv=setInterval(load,30000); // fallback de 30s si el stream se cae
    var cc=setInterval(function(){if(esSupervisorSesion())return;setOpC('');setOpN('');setOpOk(false);localStorage.removeItem('lb_kanban_token');},60000);
    return function(){ if(es)es.close(); clearInterval(pollIv); clearInterval(cc); };
  },[load]);

  function fl(m,e){setToast(m);setTErr(!!e);if(tR.current)clearTimeout(tR.current);tR.current=setTimeout(function(){setToast(null);},e?8000:3500);}
  function aLog(a,c,st,p){setSlog(function(pv){return[{id:Date.now(),t:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),w:opN,a:a,c:c,s:st,p:p}].concat(pv.slice(0,99));});}
  function gSE(){if(!sel.length)return null;for(var i=0;i<ETAPAS.length;i++){if((kb[ETAPAS[i]]||[]).some(function(p){return p.id===sel[0]}))return ETAPAS[i];}return null;}
  function tSel(id,et){var c=gSE();if(c&&c!==et){setSel([id]);return;}setSel(function(p){return p.indexOf(id)>=0?p.filter(function(x){return x!==id}):p.concat([id]);});}
  function sAll(et){setSel((kb[et]||[]).filter(function(p){return!p._tanda}).map(function(p){return p.id}));}

  async function mv(dest,act,extra){if(!sel.length)return;if(!opOk){fl('Ingresa código',true);return;}if(busy)return;setBusy(true);var ids=sel.slice();var et=gSE();setSel([]);var ok=0,er=[],r;for(var i=0;i<ids.length;i++){var body={etapa_destino:dest,responsable:opN,cod_responsable:opC};if(extra)Object.assign(body,extra);r=await apiW('PUT','/pipeline/'+ids[i]+'/avanzar',body);if(r&&r.ok)ok++;else er.push(r?r.error:'Error');}if(ok>0){aLog(act||('→ '+ET_L[dest]),ok,ET_L[et],ok*((r&&r.puntos)||0));fl(ok+' → '+ET_L[dest]);if(ids.length===1&&r&&r.etapa_anterior){setUndoData({id:ids[0],etapa_anterior:r.etapa_anterior,cod_operario:opC});if(undoTimer.current)clearTimeout(undoTimer.current);undoTimer.current=setTimeout(function(){setUndoData(null)},5000);}}if(er.length)fl(er[0],true);await load();setBusy(false);}

  function sTanda(et){if(!sel.length||!opOk){fl('Ingresa código',true);return;}var ids=sel.slice();setKb(function(p){var n=Object.assign({},p);n[et]=(n[et]||[]).map(function(x){return ids.indexOf(x.id)>=0?Object.assign({},x,{_tanda:true}):x});return n;});setTandas(function(p){var o={};o[et]=true;return Object.assign({},p,o)});aLog('Tanda',ids.length,ET_L[et],0);setSel([]);fl('Tanda en '+ET_L[et]);}
  async function fTanda(et){if(!opOk||busy)return;setBusy(true);var dest=NEXT[et]||'control_calidad';var items=(kb[et]||[]).filter(function(p){return p._tanda});var ok=0;for(var i=0;i<items.length;i++){var r=await apiW('PUT','/pipeline/'+items[i].id+'/avanzar',{etapa_destino:dest,responsable:opN,cod_responsable:opC});if(r&&r.ok)ok++;}setTandas(function(p){var o={};o[et]=false;return Object.assign({},p,o)});if(ok>0)fl('Tanda: '+ok+' → '+ET_L[dest]);await load();setBusy(false);}
  async function approve(){if(!opOk||busy)return;setBusy(true);var ids=sel.slice();setSel([]);var ok=0;for(var i=0;i<ids.length;i++){var r=await apiW('PUT','/pipeline/'+ids[i]+'/avanzar',{etapa_destino:'listo',responsable:opN});if(r&&r.ok)ok++;}if(ok>0)fl(ok+' aprobadas');await load();setBusy(false);}
  function oRej(){if(!opOk){fl('Ingresa código',true);return;}setRejM(true);setRejD('recepcion');setRejO('');}
  async function dRej(){if(busy)return;setBusy(true);var ids=sel.slice();setSel([]);setRejM(null);var deducidos=[];for(var i=0;i<ids.length;i++){var r=await apiW('PUT','/pipeline/'+ids[i]+'/rechazar',{etapa_destino:rejD,obs:rejO,descontar_puntos:true});if(r&&r.deducidos)deducidos=deducidos.concat(r.deducidos);}var msg='Rechazadas → '+ET_L[rejD];if(deducidos.length)msg+=' · descuento: '+deducidos.map(function(d){return d.nombre+' ('+d.puntos+'pts)'}).join(', ');fl(msg);await load();setBusy(false);}
  function oEnv(){if(!opOk){fl('Ingresa código',true);return;}if(!sel.length){fl('Selecciona prendas',true);return;}setEnvM(true);setEnvD('');}
  async function dEnv(){if(!envD||busy)return;setBusy(true);setEnvM(false);var ids=sel.slice();setSel([]);var r=await apiW('POST','/pipeline/enviar',{prenda_ids:ids,sede_destino:envD,responsable:opN});if(r&&r.ok){aLog('→ '+envD,ids.length,'Envío',ids.length*2);fl('Envío #'+r.envio_id+' → '+envD);}else fl((r&&r.error)||'Error',true);await load();setBusy(false);}
  async function regAcc(){if(!opOk){fl('Ingresa código',true);return;}var c=parseInt(accN);if(!c||c<=0)return;
    if(accOrigen==='local'&&!accSust.trim()){fl('Sustento requerido para registro local',true);return;}
    var endpoint=accOrigen==='local'?'/pipeline/accesorios-extra':'/pipeline/accesorios';
    var body={tipo:accT,cantidad:c,responsable:opN};
    if(accOrigen==='local')body.sustento=accSust;
    var r=await apiW('POST',endpoint,body);if(r&&r.ok){var msg=c+'× '+accT;if(r.dinero)msg+=' = S/'+r.dinero.toFixed(2);if(r.puntos)msg+=' (+'+r.puntos+'pts)';aLog(accT,c,'Acc',r.puntos||0);fl(msg);setAccN('');setAccSust('');}else fl((r&&r.error)||'Error',true);load();}

  // Carga ranking/bitacora cuando se entra a métricas
  useEffect(function(){if(tab==='metrics'){apiG('/pipeline/ranking').then(function(d){if(d)setRanking(d.ranking||[]);});apiG('/pipeline/bitacora?limit=50').then(function(d){if(d)setBita(d);});}},[tab]);
  useEffect(function(){if(tab==='diario'&&isAdm){apiG('/pipeline/diario').then(function(d){if(d)setDiario(d);});}},[tab]);

  // ── ENVÍOS DE ACCESORIOS A TIENDA ──────────────────────────────
  function loadEa(){
    return apiG('/pipeline/envios-accesorios').then(function(d){
      var lista=Array.isArray(d)?d:(d&&d.envios?d.envios:[]);
      setEaList(lista||[]);
    });
  }
  useEffect(function(){
    if(tab!=='envios-acc')return;
    if(!eaFecha)setEaFecha(new Date().toISOString().substring(0,10));
    loadEa();
  },[tab]);
  function eaClear(){setEaCorbatas(0);setEaMichis(0);setEaCorbatones(0);setEaCamisas(0);setEaZapatos(0);setEaPortas(0);setEaObs('');}
  async function eaSubmit(){
    if(!opOk){fl('Ingresa código',true);return;}
    if(!eaDest){fl('Elige sede destino',true);return;}
    if(!eaFecha){fl('Elige fecha',true);return;}
    var items=[
      {tipo:'corbata',     cantidad:parseInt(eaCorbatas)||0},
      {tipo:'michi',       cantidad:parseInt(eaMichis)||0},
      {tipo:'corbaton',    cantidad:parseInt(eaCorbatones)||0},
      {tipo:'camisa',      cantidad:parseInt(eaCamisas)||0},
      {tipo:'zapato',      cantidad:parseInt(eaZapatos)||0},
      {tipo:'porta_terno', cantidad:parseInt(eaPortas)||0}
    ].filter(function(it){return it.cantidad>0;});
    if(!items.length){fl('Agrega al menos un accesorio con cantidad > 0',true);return;}
    setEaBusy(true);
    var r=await apiW('POST','/pipeline/envios-accesorios',{sede_destino:eaDest,fecha:eaFecha,items:items,obs:eaObs,responsable:opN});
    if(r&&r.ok){fl('Envío #'+(r.envio_id||'?')+' registrado');eaClear();await loadEa();}
    else fl((r&&r.error)||'Error',true);
    setEaBusy(false);
  }

  // ── HISTORIAL UNIFICADO (solo supervisor) ──────────────────────
  function loadPh(filtros){
    var f=filtros||phF;
    var qp=[]; Object.keys(f).forEach(function(k){if(f[k])qp.push(encodeURIComponent(k)+'='+encodeURIComponent(f[k]));});
    setPhLoading(true);
    return apiG('/pipeline/historial'+(qp.length?'?'+qp.join('&'):'')).then(function(d){setPhData(d);setPhLoading(false);});
  }
  useEffect(function(){
    if(tab!=='historial'||!isAdm)return;
    loadPh(phF);
  },[tab]);
  function phUpd(k,v){
    var nf=Object.assign({},phF,{}); nf[k]=v; setPhF(nf);
    if(k==='responsable'){
      // debounce input de texto
      if(phDebounceRef.current)clearTimeout(phDebounceRef.current);
      phDebounceRef.current=setTimeout(function(){loadPh(nf);},350);
    }else{
      loadPh(nf);
    }
  }
  function phReset(){var nf={desde:'',hasta:'',sede:'',tipo:'',responsable:'',sort:'fecha_desc'};setPhF(nf);loadPh(nf);}
  async function phOpenTraza(listaId){
    var d=await apiG('/pipeline/lista/'+encodeURIComponent(listaId)+'/trazabilidad');
    if(d)setPhTraza(d);
  }

  var sE=gSE();
  var tA=ETAPAS.reduce(function(s,et){return s+(kb[et]||[]).length},0);
  var sP=slog.reduce(function(s,l){return s+l.p},0);
  // ── Búsqueda en kanban: matchea código/color/tipo (case-insensitive) ──
  var sQ=(searchQ||'').trim().toLowerCase();
  var hasSearch=sQ.length>0;
  function matchSearch(p){
    if(!hasSearch)return false;
    var c=(p.codigo||'').toLowerCase();
    var col=(p.color||'').toLowerCase();
    var tp=(p.tipo||'').toLowerCase();
    return c.indexOf(sQ)>=0||col.indexOf(sQ)>=0||tp.indexOf(sQ)>=0;
  }
  var searchTotal=0;
  if(hasSearch){
    ETAPAS.forEach(function(et){(kb[et]||[]).forEach(function(p){if(matchSearch(p))searchTotal++;});});
  }

  var tabs=[['kanban','Kanban'],['registrar','Registrar'],['acc','Accesorios'],['envios-acc','Envíos a tienda']];
  if(isAdm)tabs=tabs.concat([['diario','Diario'],['metrics','Métricas'],['historial','Historial'],['config','Config']]);
  else tabs=tabs.concat([['metrics','Métricas']]);

  return (
    <div className="kbn-app">
      {/* ───── HEADER ───── */}
      <header className="kbn-header">
        <div className="kbn-header-title">
          <div>
            <div>Prendas Recibidas</div>
            <div className="kbn-header-title-sub">Almacén Central</div>
          </div>
        </div>
        <div className="kbn-header-actions">
          {opOk&&myProg.pts>0&&(
            <div className="kbn-pts-today">
              <div className="lbl">Hoy</div>
              <div className="val">{myProg.pts} pts · {myProg.acciones} acc</div>
            </div>
          )}
          <div className="kbn-pts-session">
            <div className="lbl">Sesión</div>
            <div className="val">{sP}</div>
          </div>
          <div className="kbn-op-box">
            <div className="kbn-op-meta">
              <div className="lbl">{isAdm?'Sesión':'Operario'}</div>
              <div className={'val'+(opOk?' ok':'')}>{opOk?opN:'—'}</div>
            </div>
            {isAdm
              ? <span className="kbn-admin-badge">ADMIN</span>
              : <input type="password" className={'kbn-op-input'+(opOk?' ok':'')} value={opC} onChange={function(e){valOp(e.target.value)}} placeholder="••••" maxLength="6"/>
            }
            {opOk&&!isAdm&&<span className="kbn-op-tick">✓</span>}
          </div>
        </div>
      </header>

      {/* ───── NAV ───── */}
      <nav className="kbn-nav">
        <div className="kbn-nav-tabs">
          {tabs.map(function(t){
            return <div key={t[0]} className={'kbn-tab'+(tab===t[0]?' active':'')} onClick={function(){setTab(t[0])}}>{t[1]}</div>;
          })}
        </div>
        <div className="kbn-header-stats">
          <span className="kbn-stat-pill">{tA} en proceso</span>
          <span className="kbn-stat-pill ok">{sts.enviados||0} enviados</span>
          {accHoy.map(function(a){return <span key={a.tipo} className="kbn-stat-pill warn">{a.tipo}: {a.total}</span>})}
          {busy&&<span className="kbn-stat-pill busy">procesando</span>}
        </div>
      </nav>

      {/* ───── FILTROS (solo en kanban) ───── */}
      {tab==='kanban'&&(
        <div className="kbn-filters">
          <span className="kbn-filters-label">Filtros</span>
          {[['','Todas'],['ST','Stan'],['LB','LB'],['TR','Trece']].map(function(s){
            return <button key={s[0]||'all'} className={'kbn-filter-btn'+(fSede===s[0]?' active':'')} onClick={function(){setFSede(s[0])}}>{s[1]}</button>;
          })}
          <span className="kbn-filter-sep"/>
          {[['','Todos'],['normal','Normal'],['seco','Seco'],['especializado','Especial']].map(function(l){
            return <button key={l[0]||'all'} className={'kbn-filter-btn'+(fLav===l[0]?' active':'')} onClick={function(){setFLav(l[0])}}>{l[1]}</button>;
          })}
          <div className={'kbn-search-wrap'+(hasSearch?' has-q':'')}>
            <span className="kbn-search-icon">⌕</span>
            <input
              type="text"
              className="kbn-search-input"
              value={searchQ}
              onChange={function(e){setSearchQ(e.target.value)}}
              placeholder="Buscar por código, color o tipo..."
            />
            {hasSearch&&<span className="kbn-search-count">{searchTotal} {searchTotal===1?'coincidencia':'coincidencias'}</span>}
            {searchQ&&<button className="kbn-search-clear" onClick={function(){setSearchQ('')}} title="Limpiar búsqueda">×</button>}
          </div>
        </div>
      )}

      {/* ───── TOOLBAR STICKY (acción sobre selección) ───── */}
      {tab==='kanban'&&sel.length>0&&sE&&(
        <div className="kbn-toolbar">
          <div className="kbn-toolbar-count">
            <div className="kbn-toolbar-num">{sel.length}</div>
            <div className="kbn-toolbar-stage">
              <div className="lbl">En</div>
              <div className="val">{ET_L[sE]}</div>
            </div>
          </div>
          <div className="kbn-toolbar-sep"/>
          <div className="kbn-toolbar-actions">
            {sE==='recepcion'&&(<React.Fragment>
              <select className="kbn-select" value={tLav} onChange={function(e){setTLav(e.target.value)}}>
                <option value="normal">Lavado normal</option>
                <option value="seco">Lavado seco</option>
                <option value="especializado">Lavado especializado</option>
              </select>
              <button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('lavado','→ Lavado ('+tLav+')',{tipo_lavado:tLav})}}>→ Lavado</button>
              <button className="kbn-btn kbn-btn-warn" disabled={busy} onClick={function(){mv('refaccion','→ Refacción directa')}}>→ Refacción</button>
            </React.Fragment>)}
            {sE==='lavado'&&<button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('empatado','Lavado OK')}}>→ Empatado</button>}
            {sE==='empatado'&&<button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('refaccion')}}>→ Refacción</button>}
            {sE==='refaccion'&&(<React.Fragment>
              <button className="kbn-btn kbn-btn-soft" disabled={busy} onClick={function(){mv('compostura','→ Compostura')}}>Compostura</button>
              <button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('planchado','→ Planchado')}}>→ Planchado</button>
            </React.Fragment>)}
            {sE==='compostura'&&<button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('planchado','→ Planchado')}}>→ Planchado</button>}
            {sE==='planchado'&&<button className="kbn-btn kbn-btn-primary" disabled={busy} onClick={function(){mv('control_calidad','Planchado→Calidad')}}>→ Calidad</button>}
            {sE==='control_calidad'&&(<React.Fragment>
              <button className="kbn-btn kbn-btn-danger" disabled={busy} onClick={oRej}>Rechazar</button>
              {sel.length===1&&<button className="kbn-btn kbn-btn-soft" disabled={busy} onClick={function(){if(!opOk){fl('Ingresa código',true);return;}setSplitM(sel[0]);setSplitLavS('normal');setSplitLavP('normal');}}>Dividir terno</button>}
              <button className="kbn-btn kbn-btn-success" disabled={busy} onClick={approve}>Aprobar</button>
            </React.Fragment>)}
            {sE==='listo'&&<button className="kbn-btn kbn-btn-blue" disabled={busy} onClick={oEnv}>Enviar a tienda</button>}
          </div>
          <button className="kbn-toolbar-close" onClick={function(){setSel([])}} title="Cerrar selección">×</button>
        </div>
      )}

      {/* ───── KANBAN BOARD ───── */}
      {tab==='kanban'&&(
        <div className="kbn-board-wrap">
          <div className="kbn-board">
            {ETAPAS.map(function(et){
              var raw=kb[et]||[];
              var items=raw.filter(function(p){if(fSede&&p.sede_origen!==fSede)return false;if(fLav&&p.tipo_lavado!==fLav)return false;return true;});
              var ht=tandas[et];
              return (
                <div key={et} className="kbn-col" data-stage={et}>
                  <div className="kbn-col-head" onClick={function(){sAll(et)}}>
                    <span><span className="ic">{ET_I[et]}</span>{ET_L[et]}</span>
                    <span className="kbn-col-count">{items.length}</span>
                  </div>
                  <div className="kbn-col-body">
                    {ht&&(
                      <div className="kbn-tanda-banner">
                        Tanda activa
                        <button className="kbn-tanda-finish" onClick={function(){fTanda(et)}} disabled={busy}>Finalizar</button>
                      </div>
                    )}
                    {items.map(function(p){
                      var iS=sel.indexOf(p.id)>=0;
                      var lc=LC[p.tipo_lavado]||LC.normal;
                      var mS=matchSearch(p);
                      var cls='kbn-card';
                      if(iS)cls+=' selected';
                      else if(p.obs_calidad)cls+=' observed';
                      if(p._tanda)cls+=' in-tanda';
                      if(hasSearch)cls+=mS?' kbn-search-match':' kbn-search-dim';
                      return (
                        <div key={p.id} className={cls} onClick={function(){tSel(p.id,et)}}>
                          <div className="kbn-card-row1">
                            {p.color&&<span className="kbn-card-color-dot" style={{background:COL_MAP[p.color]||'#aaa'}}/>}
                            <div className="kbn-card-code">{p.codigo}</div>
                          </div>
                          <div className="kbn-card-meta">{p.tipo}{p.color?' · '+p.color:''}{p.talla?' · T.'+p.talla:''}</div>
                          <div className="kbn-card-pills">
                            {et!=='recepcion'&&<span className={'kbn-pill '+lc.cls}>{lc.l}</span>}
                            {p.sede_origen&&p.sede_origen!=='AL'&&<span className="kbn-pill">{p.sede_origen}</span>}
                            {p.lista_lavanderia_id&&<span className="kbn-pill kbn-pill-blue">L{p.lista_lavanderia_id}</span>}
                            {p.necesita_compostura?<span className="kbn-pill kbn-pill-red">comp.</span>:null}
                            {p.obs_calidad&&<span className="kbn-pill kbn-pill-red">devuelto</span>}
                          </div>
                          {p.obs_calidad&&<div className="kbn-card-warn">⚠ {p.obs_calidad}</div>}
                          {(p.obs_general||p.obs_refaccion||p.obs_compostura)&&!p.obs_calidad&&<div className="kbn-card-note">{p.obs_general||p.obs_refaccion||p.obs_compostura}</div>}
                        </div>
                      );
                    })}
                    {!items.length&&<div className="kbn-empty">Sin prendas</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───── TAB ACCESORIOS ───── */}
      {tab==='acc'&&(
        <div className="kbn-acc-grid">
          <div className="kbn-card-panel">
            <h3>Ingreso de producción</h3>
            <div className="kbn-step-label">1. Selección de prenda</div>
            <div className="kbn-acc-types">
              {ACC_T.map(function(t){
                var rec=accRec[t]||0;
                var proc=accHoy.find(function(a){return a.tipo===t});
                var done=proc?proc.total:0;
                return (
                  <button key={t} className={'kbn-acc-type'+(accT===t?' active':'')} onClick={function(){setAccT(t)}}>
                    {t}
                    {rec>0&&<div className="kbn-acc-type-meta">{rec} recibidos{done>0?' · '+done+' hechos':''}</div>}
                  </button>
                );
              })}
            </div>
            <div className="kbn-step-label">2. Origen</div>
            <div className="kbn-origen-row">
              {[['tienda','De tienda'],['local','Registro local']].map(function(o){
                return <button key={o[0]} className={'kbn-origen-btn'+(accOrigen===o[0]?' active':'')} onClick={function(){setAccOrigen(o[0])}}>{o[1]}</button>;
              })}
            </div>
            {accOrigen==='local'&&(
              <div style={{marginBottom:12}}>
                <div className="kbn-step-label">Sustento</div>
                <input type="text" className="kbn-input" value={accSust} onChange={function(e){setAccSust(e.target.value)}} placeholder="Ej: Compra nueva, donación..."/>
              </div>
            )}
            <div className="kbn-step-label">3. Cantidad</div>
            <input type="number" className="kbn-input kbn-input-num" value={accN} onChange={function(e){setAccN(e.target.value)}} min="1" placeholder="0"/>
            <button className="kbn-btn kbn-btn-primary kbn-btn-block" style={{marginTop:14}} onClick={regAcc} disabled={busy}>Registrar producción</button>
          </div>
          <div className="kbn-card-panel">
            <h3>Bitácora de hoy <span className="kbn-stat-pill" style={{marginLeft:'auto'}}>{accHoy.reduce(function(s,a){return s+a.total},0)} total</span></h3>
            {accHoy.length===0
              ? <div className="kbn-bita-empty">Sin registros aún</div>
              : accHoy.map(function(a){return <div key={a.tipo} className="kbn-bita-row"><span>{a.tipo}</span><strong>{a.total}</strong></div>})
            }
            <div className="kbn-pendientes">
              <div className="kbn-pendientes-title">Pendiente por trabajar</div>
              {Object.keys(accRec).length===0
                ? <div className="kbn-bita-empty" style={{fontSize:11}}>Sin accesorios pendientes</div>
                : Object.entries(accRec).map(function(e){
                    var proc=accHoy.find(function(a){return a.tipo===e[0]});
                    var done=proc?proc.total:0;
                    var pend=Math.max(0,e[1]-done);
                    if(!e[1])return null;
                    return (
                      <div key={e[0]} className="kbn-pendientes-row">
                        <span>{e[0]}</span>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <span style={{color:'var(--text3)',fontFamily:'var(--font-m)',fontSize:11}}>{done}/{e[1]}</span>
                          <div className="kbn-progress"><div className={'kbn-progress-fill'+(pend===0?' done':'')} style={{width:e[1]?((done/e[1])*100)+'%':'0%'}}/></div>
                          {pend>0
                            ? <span className="kbn-stat-pill warn">{pend} pend.</span>
                            : <span className="kbn-stat-pill ok">listo</span>}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
            <div style={{marginTop:8,fontSize:9,color:'var(--text3)',fontFamily:'var(--font-m)',letterSpacing:'.5px'}}>Se contabiliza por volumen para puntos de productividad.</div>
          </div>
        </div>
      )}

      {/* ───── TAB MÉTRICAS ───── */}
      {tab==='metrics'&&(
        <div className="kbn-metrics">
          <div className="kbn-stats-grid">
            {ETAPAS.map(function(et){
              var c=(kb[et]||[]).length;
              return (
                <div key={et} className="kbn-stat-card">
                  <div className="kbn-stat-num">{c}</div>
                  <div className="kbn-stat-lbl">{ET_L[et]}</div>
                </div>
              );
            })}
            <div className="kbn-stat-card success">
              <div className="kbn-stat-num">{sts.enviados||0}</div>
              <div className="kbn-stat-lbl">Enviados</div>
            </div>
          </div>
          <div className="kbn-section">
            <div className="kbn-section-head">Avance vs Enviado</div>
            <div className="kbn-section-body">
              <div className="kbn-progress-big">
                <div className="bar"><div className="fill" style={{width:(tA+sts.enviados)?((sts.enviados/(tA+(sts.enviados||1)))*100)+'%':'0%'}}/></div>
                <span className="num">{sts.enviados||0}/{tA+(sts.enviados||0)}</span>
              </div>
              <div className="kbn-progress-big-meta">{tA} en proceso · {sts.enviados||0} enviados a tienda</div>
            </div>
          </div>
          <div className="kbn-section">
            <div className="kbn-section-head">Ranking semanal</div>
            {ranking.length===0
              ? <div className="kbn-table-empty">Sin datos esta semana</div>
              : <table className="kbn-table"><thead><tr><th>#</th><th>Operario</th><th className="num">Acciones</th><th className="num">Puntos</th></tr></thead><tbody>{ranking.map(function(r,i){
                  var posCls=i===0?'pos-1':i===1?'pos-2':i===2?'pos-3':'';
                  return (
                    <tr key={r.emp_cod}>
                      <td className={posCls} style={{fontWeight:800}}>{i+1}</td>
                      <td style={{fontWeight:700}}>{r.emp_nombre}</td>
                      <td className="num" style={{color:'var(--text3)'}}>{r.acciones}</td>
                      <td className="num pts">{Number(r.total_pts).toFixed(1)}</td>
                    </tr>
                  );
                })}</tbody></table>
            }
          </div>
          <div className="kbn-section">
            <div className="kbn-section-head">Bitácora detallada</div>
            <div className="kbn-table-scroll">
              <table className="kbn-table">
                <thead><tr><th>Fecha</th><th>Operario</th><th>Etapa</th><th>Detalle</th><th className="num">Pts</th></tr></thead>
                <tbody>{bita.length===0
                  ? <tr><td colSpan="5" className="kbn-table-empty">Sin registros</td></tr>
                  : bita.map(function(b){return (
                      <tr key={b.id}>
                        <td style={{fontFamily:'var(--font-m)',fontSize:10,color:'var(--text3)'}}>{b.fecha}</td>
                        <td style={{fontWeight:700}}>{b.emp_nombre}</td>
                        <td><span className="kbn-pill">{b.etapa}</span></td>
                        <td style={{color:'var(--text2)'}}>{b.detalle}</td>
                        <td className="num pts">+{Number(b.puntos).toFixed(1)}</td>
                      </tr>
                    );})
                }</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───── TAB DIARIO (admin) ───── */}
      {tab==='diario'&&(
        <div className="kbn-diario">
          <div className="kbn-section">
            <div className="kbn-section-head" style={{justifyContent:'space-between',display:'flex'}}>
              <span>Resumen diario {diario?'· '+diario.fecha:''}</span>
              <span className="kbn-stat-pill">{diario?diario.total:0} movimientos</span>
            </div>
            <div className="kbn-section-body">
              {diario&&diario.por_operario&&diario.por_operario.length>0
                ? <React.Fragment>
                    <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:'var(--navy)'}}>Por operario</div>
                    <div className="kbn-diario-grid">
                      {diario.por_operario.map(function(op){return (
                        <div key={op.nombre} className="kbn-diario-op">
                          <div className="kbn-diario-op-name">{op.nombre}</div>
                          <div className="kbn-diario-op-acc">{op.acciones} acciones</div>
                          <div className="kbn-diario-op-tags">
                            {Object.entries(op.etapas).map(function(e){return <span key={e[0]} className="kbn-pill">{ET_L[e[0]]||e[0]}: {e[1]}</span>})}
                          </div>
                        </div>
                      );})}
                    </div>
                    <div className="kbn-table-scroll" style={{marginTop:14}}>
                      <table className="kbn-table">
                        <thead><tr><th>Código</th><th>Tipo</th><th>De → A</th><th>Operario</th></tr></thead>
                        <tbody>{(diario.movimientos||[]).map(function(m){return (
                          <tr key={m.id}>
                            <td style={{fontFamily:'var(--font-m)',fontWeight:700}}>{m.codigo}</td>
                            <td>{m.tipo} {m.color}</td>
                            <td><span className="kbn-pill">{ET_L[m.etapa_anterior]||m.etapa_anterior||'—'}</span> → <span className="kbn-pill">{ET_L[m.etapa_nueva]||m.etapa_nueva}</span></td>
                            <td>{m.responsable}</td>
                          </tr>
                        );})}</tbody>
                      </table>
                    </div>
                  </React.Fragment>
                : <div className="kbn-table-empty">Sin movimientos hoy</div>
              }
            </div>
          </div>
        </div>
      )}

      {/* ───── TAB REGISTRAR ───── */}
      {tab==='registrar'&&(
        <div className="kbn-reg">
          <div className="kbn-card-panel">
            <h3>Registrar prenda local</h3>
            <p style={{fontSize:11,color:'var(--text2)',marginBottom:14,lineHeight:1.5}}>Para prendas que no vienen de tienda. Se registran directamente en recepción.</p>
            {regItems.map(function(it,idx){return (
              <div key={idx} className="kbn-reg-row">
                <input className="kbn-reg-input code" placeholder="Código" value={it.cod||''} onChange={function(e){setRegItems(function(p){var n=p.slice();n[idx]=Object.assign({},n[idx],{cod:e.target.value.toUpperCase()});return n;});}}/>
                <select className="kbn-select" value={it.tipo||'Terno completo'} onChange={function(e){setRegItems(function(p){var n=p.slice();n[idx]=Object.assign({},n[idx],{tipo:e.target.value});return n;});}}>
                  <option>Terno completo</option><option>Saco</option><option>Pantalón</option><option>Chaleco</option><option>Blazer</option><option>Falda</option>
                </select>
                <input className="kbn-reg-input color" placeholder="Color" value={it.color||''} onChange={function(e){setRegItems(function(p){var n=p.slice();n[idx]=Object.assign({},n[idx],{color:e.target.value});return n;});}}/>
                <input className="kbn-reg-input talla" placeholder="Talla" value={it.talla||''} onChange={function(e){setRegItems(function(p){var n=p.slice();n[idx]=Object.assign({},n[idx],{talla:e.target.value});return n;});}}/>
                <button className="kbn-reg-del" onClick={function(){setRegItems(function(p){return p.filter(function(_,i){return i!==idx});});}}>×</button>
              </div>
            );})}
            <button className="kbn-reg-add" onClick={function(){setRegItems(function(p){return p.concat([{cod:'',tipo:'Terno completo',color:'',talla:''}]);});}}>+ Agregar prenda</button>
            {regItems.length>0&&<button className="kbn-btn kbn-btn-primary kbn-btn-block" disabled={regBusy} onClick={async function(){if(!opOk){fl('Ingresa código',true);return;}setRegBusy(true);var r=await apiW('POST','/pipeline/registrar-local',{items:regItems});if(r&&r.ok){fl(r.count+' prendas registradas');setRegItems([]);await load();}else{fl((r&&r.error)||'Error',true);}setRegBusy(false);}}>Registrar {regItems.length} prenda(s)</button>}
          </div>
        </div>
      )}

      {/* ───── TAB ENVÍOS A TIENDA (accesorios) ───── */}
      {tab==='envios-acc'&&(
        <div className="kbn-ea">
          <div className="kbn-card-panel">
            <h3>Nuevo envío de accesorios</h3>
            <div className="kbn-ea-row2">
              <div>
                <div className="kbn-step-label">Sede destino</div>
                <select className="kbn-input" value={eaDest} onChange={function(e){setEaDest(e.target.value)}}>
                  <option value="">Elegir...</option>
                  {SEDES_E.map(function(s){return <option key={s.c} value={s.c}>{s.l}</option>})}
                </select>
              </div>
              <div>
                <div className="kbn-step-label">Fecha</div>
                <input type="date" className="kbn-input" value={eaFecha} onChange={function(e){setEaFecha(e.target.value)}}/>
              </div>
            </div>
            <div className="kbn-step-label" style={{marginTop:14}}>Cantidades por tipo</div>
            <div className="kbn-ea-grid">
              {[['Corbatas',eaCorbatas,setEaCorbatas],['Michis',eaMichis,setEaMichis],['Corbatones',eaCorbatones,setEaCorbatones],['Camisas',eaCamisas,setEaCamisas],['Zapatos (pares)',eaZapatos,setEaZapatos],['Porta ternos',eaPortas,setEaPortas]].map(function(t){
                return (
                  <div key={t[0]} className="kbn-ea-cell">
                    <label>{t[0]}</label>
                    <input type="number" min="0" className="kbn-input" value={t[1]} onChange={function(e){t[2](parseInt(e.target.value)||0)}}/>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:12}}>
              <div className="kbn-step-label">Observaciones (opcional)</div>
              <textarea className="kbn-input" rows="2" value={eaObs} onChange={function(e){setEaObs(e.target.value)}} placeholder="Notas..."></textarea>
            </div>
            <div className="kbn-ea-actions">
              <button className="kbn-btn kbn-btn-primary" disabled={eaBusy} onClick={eaSubmit}>Registrar envío</button>
              <button className="kbn-btn kbn-btn-ghost" onClick={eaClear}>Limpiar</button>
            </div>
          </div>
          <div className="kbn-card-panel">
            <h3>Envíos recientes</h3>
            {!eaList.length
              ? <div className="kbn-bita-empty">Sin envíos registrados</div>
              : <div className="kbn-ea-list">
                  {eaList.map(function(e){
                    var items=(e.items||[]).map(function(it){return it.cantidad+'× '+it.tipo;}).join(', ')||'—';
                    var fecha=(e.created_at||e.fecha||'').replace('T',' ').substring(0,16);
                    var sedeTxt=(SEDES_E.find(function(s){return s.c===e.sede_destino})||{l:e.sede_destino||'—'}).l;
                    return (
                      <div key={e.id} className="kbn-ea-item">
                        <div className="kbn-ea-item-meta">
                          <span className="kbn-ea-item-fecha">{fecha}</span>
                          <span className="kbn-ea-item-dest">→ {sedeTxt}</span>
                          <span className="kbn-ea-item-id">#{e.id}</span>
                          {e.validado_tienda
                            ? <span className="kbn-stat-pill ok">validado</span>
                            : <span className="kbn-stat-pill warn">sin validar</span>}
                        </div>
                        <div className="kbn-ea-item-items">{items}</div>
                        {e.obs&&<div className="kbn-ea-item-obs">{e.obs}</div>}
                        <div className="kbn-ea-item-resp">por {e.responsable||'—'}</div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>
      )}

      {/* ───── TAB HISTORIAL (supervisor) ───── */}
      {tab==='historial'&&isAdm&&(
        <div className="kbn-hist">
          <div className="kbn-hist-filters">
            <div><label>Desde</label><input type="date" className="kbn-input" value={phF.desde} onChange={function(e){phUpd('desde',e.target.value)}}/></div>
            <div><label>Hasta</label><input type="date" className="kbn-input" value={phF.hasta} onChange={function(e){phUpd('hasta',e.target.value)}}/></div>
            <div><label>Sede</label>
              <select className="kbn-input" value={phF.sede} onChange={function(e){phUpd('sede',e.target.value)}}>
                <option value="">Todas</option>
                <option value="ST">Stand</option>
                <option value="LB">LuceBien</option>
                <option value="AL">Almacén</option>
                <option value="TR">Trece</option>
              </select>
            </div>
            <div><label>Tipo</label>
              <select className="kbn-input" value={phF.tipo} onChange={function(e){phUpd('tipo',e.target.value)}}>
                <option value="">Todos</option>
                <option value="prenda">Movimientos de prendas</option>
                <option value="accesorio">Accesorios procesados</option>
                <option value="lista">Envíos desde tienda</option>
                <option value="envio">Envíos a tienda (prendas)</option>
                <option value="envio_acc">Envíos a tienda (accesorios)</option>
              </select>
            </div>
            <div><label>Responsable</label><input type="text" className="kbn-input" value={phF.responsable} onChange={function(e){phUpd('responsable',e.target.value)}} placeholder="Buscar nombre..."/></div>
            <div><label>Orden</label>
              <select className="kbn-input" value={phF.sort} onChange={function(e){phUpd('sort',e.target.value)}}>
                <option value="fecha_desc">Fecha descendente</option>
                <option value="fecha_asc">Fecha ascendente</option>
              </select>
            </div>
            <div className="kbn-hist-reset"><button className="kbn-btn kbn-btn-ghost" onClick={phReset}>Limpiar filtros</button></div>
          </div>
          <div className="kbn-hist-stats">
            {phData?(<React.Fragment>
              <span>Total: <strong>{phData.stats.total}</strong></span>
              {Object.keys(phData.stats.por_tipo||{}).map(function(t){
                var lbl={prenda:'Prendas',accesorio:'Accesorios',lista:'Listas',envio:'Envíos prendas',envio_acc:'Envíos acc.'}[t]||t;
                return <span key={t}>· {lbl}: <strong>{phData.stats.por_tipo[t]}</strong></span>;
              })}
            </React.Fragment>):<span>—</span>}
          </div>
          <div className="kbn-hist-body">
            {phLoading?<div className="kbn-bita-empty">Cargando historial...</div>
              :!phData||!phData.eventos||!phData.eventos.length?<div className="kbn-bita-empty">Sin eventos con los filtros elegidos</div>
              :<table className="kbn-table">
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Sede</th><th>Responsable</th><th>Detalle</th></tr></thead>
                <tbody>{phData.eventos.map(function(ev,i){
                  var fecha=(ev.fecha||'').replace('T',' ').substring(0,16);
                  var tipoLbl={prenda:'Prenda',accesorio:'Accesorio',lista:'Lista',envio:'Envío prendas',envio_acc:'Envío acc.'}[ev.tipo]||ev.tipo;
                  return (
                    <tr key={i}>
                      <td style={{fontFamily:'var(--font-m)',fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>{fecha}</td>
                      <td><span className="kbn-pill">{tipoLbl}</span></td>
                      <td style={{fontWeight:700,fontSize:11}}>{ev.sede||'—'}</td>
                      <td style={{fontSize:11}}>{ev.responsable||'—'}</td>
                      <td style={{fontSize:11}}>
                        <strong>{ev.accion}</strong>{ev.ref?(' · '+ev.ref):''}
                        {ev.tipo==='accesorio'&&ev.enviado&&<span className="kbn-stat-pill ok" style={{marginLeft:6}}>enviado</span>}
                        {ev.obs&&<span style={{color:'var(--text3)'}}> · {ev.obs}</span>}
                        {(ev.tipo==='lista'&&ev.ref_id)&&<button className="kbn-hist-link" onClick={function(){phOpenTraza(ev.ref_id)}}>ver trazabilidad</button>}
                        {(ev.tipo==='prenda'&&ev.lista_id)&&<button className="kbn-hist-link" onClick={function(){phOpenTraza(ev.lista_id)}}>lista #{ev.lista_id}</button>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            }
          </div>
        </div>
      )}

      {/* ───── TAB CONFIG (admin) ───── */}
      {tab==='config'&&isAdm&&<ConfigPanel/>}

      {/* ───── MODAL: TRAZABILIDAD DE LISTA ───── */}
      {phTraza&&(
        <div className="kbn-modal-overlay" onClick={function(){setPhTraza(null)}}>
          <div className="kbn-modal" style={{width:760,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}} onClick={function(e){e.stopPropagation()}}>
            <h3>Lista #{phTraza.lista.id} · {phTraza.lista.sede} · {phTraza.lista.tipo}</h3>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:10}}>
              Fecha {phTraza.lista.fecha} · Estado <strong>{phTraza.lista.estado}</strong> · Resp inv: {phTraza.lista.resp_inv||'—'} · Traslado: {phTraza.lista.resp_traslado||'—'}
            </div>
            <div style={{fontSize:11,marginBottom:10,fontFamily:'var(--font-m)'}}>
              Camisas {phTraza.lista.camisas||0} · Corbatas {phTraza.lista.corbatas||0} · Michis {phTraza.lista.michis||0} · Corbatones {phTraza.lista.corbatones||0} · Zapatos {phTraza.lista.zapatos||0} · Portas {phTraza.lista.porta_ternos||0}
            </div>
            <div style={{fontWeight:700,marginTop:10,color:'var(--navy)'}}>Prendas asociadas ({(phTraza.prendas||[]).length})</div>
            {(!phTraza.prendas||!phTraza.prendas.length)
              ? <div className="kbn-bita-empty">Sin prendas rastreadas en el pipeline</div>
              : <div style={{marginTop:6,maxHeight:'50vh',overflow:'auto'}}>
                  {phTraza.prendas.map(function(p){return (
                    <div key={p.id} style={{border:'1px solid var(--border-s)',borderRadius:7,padding:9,marginBottom:6,background:'var(--s2)'}}>
                      <div style={{fontWeight:700,fontFamily:'var(--font-m)'}}>{p.codigo||'?'} · {p.tipo||''} {p.color||''} {p.talla||''} <span className="kbn-pill" style={{marginLeft:6}}>{p.etapa||''}</span></div>
                      {p.historial&&p.historial.length>0&&(
                        <div style={{fontSize:10,marginTop:4,color:'var(--text2)'}}>
                          {p.historial.map(function(h,j){return (
                            <div key={j}>· {(h.fecha||'').substring(0,16)} — {h.etapa_anterior?(h.etapa_anterior+'→'):''}{h.etapa_nueva} · {h.responsable||'—'}{h.obs?(' · '+h.obs):''}</div>
                          );})}
                        </div>
                      )}
                    </div>
                  );})}
                </div>
            }
            <div className="kbn-modal-actions" style={{marginTop:12}}>
              <button className="kbn-btn kbn-btn-ghost" onClick={function(){setPhTraza(null)}}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── MODAL: RECHAZAR ───── */}
      {rejM&&(
        <div className="kbn-modal-overlay" onClick={function(){setRejM(null)}}>
          <div className="kbn-modal" onClick={function(e){e.stopPropagation()}}>
            <h3>Rechazar {sel.length} prenda(s)</h3>
            <label>Devolver a etapa</label>
            <select className="kbn-input" value={rejD} onChange={function(e){setRejD(e.target.value)}} style={{marginBottom:12}}>
              <option value="recepcion">Recepción (reiniciar)</option>
              <option value="lavado">Lavado</option>
              <option value="empatado">Empatado</option>
              <option value="refaccion">Refacción</option>
              <option value="compostura">Compostura</option>
              <option value="planchado">Planchado</option>
            </select>
            <label>Motivo</label>
            <input type="text" className="kbn-input" value={rejO} onChange={function(e){setRejO(e.target.value)}} placeholder="Describe el motivo..."/>
            <div className="kbn-modal-actions">
              <button className="kbn-btn kbn-btn-ghost" onClick={function(){setRejM(null)}}>Cancelar</button>
              <button className="kbn-btn kbn-btn-danger" onClick={dRej} disabled={busy}>Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── MODAL: ENVIAR ───── */}
      {envM&&(
        <div className="kbn-modal-overlay" onClick={function(){setEnvM(false)}}>
          <div className="kbn-modal" onClick={function(e){e.stopPropagation()}}>
            <h3>Enviar {sel.length} prenda(s)</h3>
            <label>Destino</label>
            <select className="kbn-input" value={envD} onChange={function(e){setEnvD(e.target.value)}} style={{marginBottom:12}}>
              <option value="">— Seleccionar tienda —</option>
              {SEDES_E.map(function(s){return <option key={s.c} value={s.c}>{s.l}</option>})}
            </select>
            <div className="kbn-modal-list">
              {sel.map(function(id){
                var p=null;(kb['listo']||[]).forEach(function(x){if(x.id===id)p=x;});
                if(!p)return null;
                return <div key={id} className="kbn-modal-list-row"><strong>{p.codigo}</strong> · {p.tipo}{p.color?' · '+p.color:''}</div>;
              })}
            </div>
            <div className="kbn-modal-actions">
              <button className="kbn-btn kbn-btn-ghost" onClick={function(){setEnvM(false)}}>Cancelar</button>
              <button className="kbn-btn kbn-btn-blue" onClick={dEnv} disabled={busy||!envD}>Enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── MODAL: DIVIDIR TERNO ───── */}
      {splitM&&(
        <div className="kbn-modal-overlay" onClick={function(){setSplitM(null)}}>
          <div className="kbn-modal" onClick={function(e){e.stopPropagation()}}>
            <h3>Dividir terno en saco + pantalón</h3>
            <p>Cada pieza puede tener distinto tipo de lavado. Los puntos se dividen 50/50.</p>
            <label>Saco · tipo de lavado</label>
            <select className="kbn-input" value={splitLavS} onChange={function(e){setSplitLavS(e.target.value)}} style={{marginBottom:10}}>
              <option value="normal">Normal</option><option value="seco">Seco</option><option value="especializado">Especializado</option>
            </select>
            <label>Pantalón · tipo de lavado</label>
            <select className="kbn-input" value={splitLavP} onChange={function(e){setSplitLavP(e.target.value)}} style={{marginBottom:14}}>
              <option value="normal">Normal</option><option value="seco">Seco</option><option value="especializado">Especializado</option>
            </select>
            <div className="kbn-modal-actions">
              <button className="kbn-btn kbn-btn-ghost" onClick={function(){setSplitM(null)}}>Cancelar</button>
              <button className="kbn-btn kbn-btn-soft" disabled={busy} onClick={async function(){setBusy(true);var r=await apiW('POST','/pipeline/'+splitM+'/dividir',{lavado_saco:splitLavS,lavado_pantalon:splitLavP});setSplitM(null);setSel([]);if(r&&r.ok)fl('Terno dividido');else fl((r&&r.error)||'Error',true);await load();setBusy(false);}}>Dividir</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── TOAST + UNDO ───── */}
      {toast&&<div className={'kbn-toast'+(tErr?' error':'')}>{toast}</div>}
      {undoData&&(
        <div className="kbn-undo">
          <span>Movimiento realizado</span>
          <button className="kbn-undo-btn" onClick={async function(){var u=undoData;setUndoData(null);await apiW('PUT','/pipeline/'+u.id+'/deshacer',{etapa_anterior:u.etapa_anterior,cod_operario:u.cod_operario});fl('Deshecho');await load();}}>Deshacer</button>
          <div className="kbn-undo-bar"/>
        </div>
      )}
    </div>
  );
}

function ConfigPanel(){
  const[cfg,setCfg]=useState({});const[saved,setSaved]=useState(false);
  useEffect(function(){apiG('/pipeline/config-puntos').then(function(d){if(d)setCfg(d);});},[]);
  var items=[
    {k:'pts_lavado_normal',l:'Lavado normal',d:'Puntos por lavar 1 terno completo (prenda suelta = mitad)'},
    {k:'pts_lavado_seco',l:'Lavado seco',d:'Puntos por lavado en seco'},
    {k:'pts_lavado_especializado',l:'Lavado especializado',d:'Puntos por lavado especializado'},
    {k:'pts_empatado',l:'Empatado',d:'Puntos por empatar 1 prenda'},
    {k:'pts_refaccion',l:'Refacción',d:'Puntos por refaccionar'},
    {k:'pts_compostura',l:'Compostura',d:'Puntos por compostura'},
    {k:'pts_planchado',l:'Planchado',d:'Puntos por planchar (prenda suelta = mitad)'},
    {k:'pts_control_calidad',l:'Control calidad',d:'Puntos por revisar en calidad'},
    {k:'pts_accesorio',l:'Accesorio',d:'Puntos por procesar 1 accesorio'},
    {k:'precio_camisa',l:'Precio camisa',d:'Precio unitario camisa (S/.)'},
    {k:'pts_envio',l:'Envío',d:'Puntos por enviar prenda a tienda'}
  ];
  async function save(){var r=await apiW('PUT','/pipeline/config-puntos',cfg);if(r&&r.ok){setSaved(true);setTimeout(function(){setSaved(false)},2000);}}
  return (
    <div className="kbn-config">
      <div className="kbn-config-title">Configuración de puntajes</div>
      <div className="kbn-config-grid">
        {items.map(function(it){return (
          <div key={it.k} className="kbn-config-item">
            <div className="kbn-config-lbl">{it.l}</div>
            <div className="kbn-config-desc">{it.d}</div>
            <input type="number" className="kbn-config-num" value={cfg[it.k]||0} min={0} max={50} step={0.5} onChange={function(e){setCfg(function(p){var n=Object.assign({},p);n[it.k]=parseFloat(e.target.value)||0;return n;});}}/>
          </div>
        );})}
      </div>
      <button className={'kbn-config-save'+(saved?' saved':'')} onClick={save}>{saved?'Guardado ✓':'Guardar puntajes'}</button>
    </div>
  );
}

var _r=document.getElementById('almacen-kanban-root');
if(_r)ReactDOM.createRoot(_r).render(<KanbanApp/>);
