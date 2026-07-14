(function(){
  const STORAGE_KEY = 'confess-notes';
  const SHARED = true;
  const board = document.getElementById('board');
  const overlay = document.getElementById('overlay');
  const modalBody = document.getElementById('modalBody');
  const addBtn = document.getElementById('add-btn');
  const closeModal = document.getElementById('closeModal');
  const heartsBg = document.getElementById('heartsBg');

  const colors = ['paper-yellow','paper-pink','paper-mint','paper-sky','paper-lilac'];
  let notes = [];

  // ---------- synthesized sound effects (no audio files needed) ----------
  const SFX = (function(){
    let ctx = null;
    function getCtx(){
      if(!ctx){
        try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch(e){ ctx = null; }
      }
      if(ctx && ctx.state === 'suspended'){ ctx.resume(); }
      return ctx;
    }

    function tone(freq, start, dur, type, gainPeak, glideTo){
      const c = getCtx();
      if(!c) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + start);
      if(glideTo){
        osc.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + start + dur);
      }
      gain.gain.setValueAtTime(0.0001, c.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + dur + 0.02);
    }

    function noiseBurst(start, dur, gainPeak, filterFreq){
      const c = getCtx();
      if(!c) return;
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2 - 1); }
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq || 1500;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, c.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      src.connect(filter).connect(gain).connect(c.destination);
      src.start(c.currentTime + start);
      src.stop(c.currentTime + start + dur + 0.02);
    }

    return {
      // soft click for buttons/toggles
      click(){ tone(520, 0, 0.06, 'triangle', 0.05); },
      // gentle open/paper rustle
      open(){
        noiseBurst(0, 0.18, 0.045, 1800);
        tone(300, 0, 0.08, 'sine', 0.03, 420);
      },
      // bright little pin/pop when a confession is posted
      pin(){
        tone(660, 0, 0.09, 'triangle', 0.07, 880);
        tone(990, 0.06, 0.08, 'sine', 0.04, 1200);
      },
      // soft crumple/drop for delete
      delete(){
        noiseBurst(0, 0.22, 0.06, 900);
        tone(220, 0.02, 0.16, 'sine', 0.05, 90);
      },
      // whisper for modal close
      close(){ tone(260, 0, 0.05, 'sine', 0.03, 180); }
    };
  })();

  // ---------- ambient floating hearts ----------
  function spawnHearts(){
    for(let i=0;i<12;i++){
      const h = document.createElement('div');
      h.className = 'heart-float';
      h.textContent = '♥';
      h.style.left = Math.random()*100 + 'vw';
      h.style.fontSize = (14 + Math.random()*18) + 'px';
      h.style.animationDuration = (14 + Math.random()*12) + 's';
      h.style.animationDelay = (Math.random()*14) + 's';
      heartsBg.appendChild(h);
    }
  }
  spawnHearts();

  // ---------- storage helpers ----------
  // In the Claude.ai preview, window.storage is available and notes are
  // shared/global across everyone who opens this artifact link.
  // Once downloaded and opened as a plain .html file, window.storage does
  // not exist (there's no server), so we fall back to the browser's own
  // localStorage. That works fully offline and online, but notes are then
  // only visible in that browser/device, not shared globally.
  const hasPlatformStorage = !!(window.storage && typeof window.storage.get === 'function');

  async function loadNotes(){
    if(hasPlatformStorage){
      try{
        const res = await window.storage.get(STORAGE_KEY, SHARED);
        if(res && res.value){
          return JSON.parse(res.value);
        }
        return [];
      }catch(e){
        return [];
      }
    }
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      return [];
    }
  }

  async function saveNotes(arr){
    if(hasPlatformStorage){
      try{
        const res = await window.storage.set(STORAGE_KEY, JSON.stringify(arr), SHARED);
        return !!res;
      }catch(e){
        console.error('save failed', e);
        return false;
      }
    }
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      return true;
    }catch(e){
      console.error('local save failed', e);
      return false;
    }
  }

  function fmtDate(ts){
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  // ---------- rendering ----------
  function renderBoard(){
    board.innerHTML = '';
    if(notes.length === 0){
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<span>♡</span>The wall is empty. Be the first to confess.';
      board.appendChild(empty);
      return;
    }

    const isMobile = window.innerWidth < 700;
    notes.forEach(n=>{
      const el = document.createElement('div');
      el.className = 'note ' + n.color;
      el.style.left = (isMobile ? (n.x*0.6) : n.x) + '%';
      el.style.top = n.y + 'px';
      el.style.transform = 'rotate(' + n.rot + 'deg)';
      el.innerHTML =
        '<div class="pin"></div>' +
        '<button class="quick-delete" title="Delete this confession">✕</button>' +
        '<div class="note-text"></div>' +
        '<div class="heart-mark">♥</div>';
      el.querySelector('.note-text').textContent = n.text;
      el.addEventListener('click', ()=>{ SFX.open(); openView(n.id); });
      el.querySelector('.quick-delete').addEventListener('click', (e)=>{
        e.stopPropagation();
        quickDelete(n.id);
      });
      board.appendChild(el);
    });

    // set board height to fit lowest note
    let maxBottom = 300;
    notes.forEach(n=>{ maxBottom = Math.max(maxBottom, n.y + 220); });
    board.style.minHeight = maxBottom + 'px';
  }

  function randomLayout(){
    return {
      x: 4 + Math.random()*72,
      y: 20 + Math.random()* Math.max(300, (notes.length*40)),
      rot: (Math.random()*16 - 8).toFixed(1)
    };
  }

  // ---------- modal: add ----------
  function openAdd(){
    modalBody.innerHTML =
      '<h2>New confession</h2>' +
      '<textarea id="addText" placeholder="Say what you\'ve been holding back..." maxlength="1500"></textarea>' +
      '<div class="status-msg" id="addStatus"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="cancelAdd">Cancel</button>' +
        '<button class="btn btn-primary" id="postBtn">Pin it 💌</button>' +
      '</div>';
    overlay.classList.add('active');
    document.getElementById('addText').focus();
    document.getElementById('cancelAdd').addEventListener('click', close);
    document.getElementById('postBtn').addEventListener('click', async ()=>{
      const text = document.getElementById('addText').value.trim();
      const status = document.getElementById('addStatus');
      if(!text){
        status.textContent = 'Write something first.';
        return;
      }
      status.textContent = 'Pinning...';
      const layout = randomLayout();
      const newNote = {
        id: 'n' + Date.now() + Math.random().toString(36).slice(2,7),
        text: text,
        color: colors[Math.floor(Math.random()*colors.length)],
        created: Date.now(),
        edited: null,
        x: layout.x, y: layout.y, rot: layout.rot
      };
      notes.unshift(newNote);
      const ok = await saveNotes(notes);
      if(ok){
        renderBoard();
        SFX.pin();
        close();
      }else{
        status.textContent = 'Could not save. Try again.';
        notes.shift();
      }
    });
  }

  // ---------- modal: view ----------
  function openView(id){
    const n = notes.find(x=>x.id===id);
    if(!n) return;
    modalBody.innerHTML =
      '<h2>A confession</h2>' +
      '<div class="view-text"></div>' +
      '<div class="timestamp"></div>' +
      '<div class="status-msg" id="viewStatus"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-danger" id="delBtn">Delete</button>' +
        '<button class="btn btn-secondary" id="editBtn">Edit</button>' +
        '<button class="btn btn-primary" id="doneBtn">Close</button>' +
      '</div>';
    modalBody.querySelector('.view-text').textContent = n.text;
    modalBody.querySelector('.timestamp').textContent =
      'pinned ' + fmtDate(n.created) + (n.edited ? ' · edited ' + fmtDate(n.edited) : '');

    document.getElementById('doneBtn').addEventListener('click', close);
    document.getElementById('editBtn').addEventListener('click', ()=> openEdit(id));
    const delBtn = document.getElementById('delBtn');
    let deleteArmed = false;
    delBtn.addEventListener('click', async ()=>{
      const status = document.getElementById('viewStatus');
      if(!deleteArmed){
        deleteArmed = true;
        delBtn.textContent = 'Click again to confirm';
        status.textContent = 'This removes it from the wall for everyone.';
        return;
      }
      status.textContent = 'Deleting...';
      const backup = notes;
      notes = notes.filter(x=>x.id!==id);
      const ok = await saveNotes(notes);
      if(ok){
        renderBoard();
        SFX.delete();
        close();
      }else{
        notes = backup;
        status.textContent = 'Could not delete. Try again.';
        deleteArmed = false;
        delBtn.textContent = 'Delete';
      }
    });
  }

  // ---------- modal: edit ----------
  function openEdit(id){
    const n = notes.find(x=>x.id===id);
    if(!n) return;
    modalBody.innerHTML =
      '<h2>Edit confession</h2>' +
      '<textarea id="editText" maxlength="1500"></textarea>' +
      '<div class="status-msg" id="editStatus"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="cancelEdit">Cancel</button>' +
        '<button class="btn btn-primary" id="saveEdit">Save changes</button>' +
      '</div>';
    document.getElementById('editText').value = n.text;
    document.getElementById('cancelEdit').addEventListener('click', ()=> openView(id));
    document.getElementById('saveEdit').addEventListener('click', async ()=>{
      const newText = document.getElementById('editText').value.trim();
      const status = document.getElementById('editStatus');
      if(!newText){
        status.textContent = 'Confession can\'t be empty.';
        return;
      }
      status.textContent = 'Saving...';
      const backupText = n.text;
      const backupEdited = n.edited;
      n.text = newText;
      n.edited = Date.now();
      const ok = await saveNotes(notes);
      if(ok){
        renderBoard();
        SFX.click();
        openView(id);
      }else{
        n.text = backupText;
        n.edited = backupEdited;
        status.textContent = 'Could not save. Try again.';
      }
    });
  }

  function close(){
    SFX.close();
    overlay.classList.remove('active');
    modalBody.innerHTML = '';
  }

  async function quickDelete(id){
    const backup = notes;
    notes = notes.filter(x=>x.id!==id);
    renderBoard();
    const ok = await saveNotes(notes);
    if(ok){
      SFX.delete();
    }else{
      notes = backup;
      renderBoard();
    }
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  closeModal.addEventListener('click', close);
  addBtn.addEventListener('click', ()=>{ SFX.click(); openAdd(); });
  window.addEventListener('resize', renderBoard);

  // ---------- init ----------
  (async function init(){
    const noteEl = document.getElementById('globalNote');
    if(noteEl){
      noteEl.textContent = hasPlatformStorage
        ? '💌 every confession here is public — visible to anyone who opens this wall'
        : '💌 saved right in this browser — works offline, and pins stay here even after you close the tab';
    }
    notes = await loadNotes();
    // normalize legacy/missing layout fields just in case
    notes.forEach(n=>{
      if(typeof n.x !== 'number') n.x = 4 + Math.random()*72;
      if(typeof n.y !== 'number') n.y = 20 + Math.random()*300;
      if(n.rot === undefined) n.rot = (Math.random()*16 - 8).toFixed(1);
      if(!n.color) n.color = colors[Math.floor(Math.random()*colors.length)];
    });
    renderBoard();
  })();
})();
