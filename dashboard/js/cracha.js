/**
 * Gerador de Crachá — Engecom
 * Página standalone (cracha.html). Sem dependência de config/sheets.
 *
 * - Preenche o preview (frente/verso) em tempo real
 * - Gera QR Code (validação) e código de barras (ID)
 * - Mantém uma "turma" (roster) em localStorage
 * - Exporta PNG por lado, imprime a turma e baixa todos em .zip (html2canvas + JSZip)
 */
(function () {
  'use strict';

  var LS_KEY = 'engecom_crachas_turma';
  var $ = function (id) { return document.getElementById(id); };

  // ---- Estado ----
  var turma = [];           // [{id, nome, cargo, matricula, prefixo, foto(dataURL), ...}]
  var editandoId = null;    // id do membro em edição (null = novo)
  var fotoAtual = '';       // dataURL da foto carregada no form

  var campos = ['fNome', 'fCargo', 'fMatricula', 'fPrefixo', 'fTel', 'fEmail', 'fSite', 'fQR'];

  // ---------- Util ----------
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function lerForm() {
    return {
      id: editandoId || uid(),
      nome: $('fNome').value.trim(),
      cargo: $('fCargo').value.trim(),
      matricula: $('fMatricula').value.trim(),
      prefixo: $('fPrefixo').value.trim() || 'ENGC',
      tel: $('fTel').value.trim(),
      email: $('fEmail').value.trim(),
      site: $('fSite').value.trim(),
      qrBase: $('fQR').value.trim(),
      foto: fotoAtual
    };
  }

  function idCompleto(d) {
    return (d.prefixo || 'ENGC') + (d.matricula || '');
  }

  // ---------- Render do preview ----------
  function render() {
    var d = lerForm();

    $('pvNome').textContent = d.nome || 'NOME DO COLABORADOR';
    $('pvCargo').textContent = d.cargo || 'CARGO';
    $('pvMat').textContent = d.matricula || '00000';
    $('pvSite1').textContent = d.site || '';
    $('pvSite2').textContent = d.site || '';
    $('pvTel').textContent = d.tel || '';
    $('pvEmail').textContent = d.email || '';

    var full = idCompleto(d);
    $('pvID').textContent = 'ID: ' + full;

    // Foto
    var box = $('pvFoto');
    if (d.foto) {
      box.innerHTML = '<img src="' + d.foto + '" alt="foto">';
    } else {
      box.innerHTML = '<div class="ph-empty"><i class="fa-solid fa-user"></i></div>';
    }

    renderQR(d.qrBase + full);
    renderBarcode(full);
  }

  function renderQR(texto) {
    var box = $('pvQR');
    box.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(texto || 'ENGECOM');
      qr.make();
      // createImgTag(cellSize, margin) -> <img> com data URL (gif) — compatível com html2canvas
      box.innerHTML = qr.createImgTag(6, 0);
      var img = box.querySelector('img');
      if (img) { img.style.width = '100%'; img.style.height = 'auto'; img.removeAttribute('width'); img.removeAttribute('height'); }
    } catch (e) {
      console.error('QR erro:', e);
    }
  }

  function renderBarcode(valor) {
    try {
      JsBarcode('#pvBarcode', valor || 'ENGECOM', {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height: 60,
        width: 2
      });
    } catch (e) {
      console.error('Barcode erro:', e);
    }
  }

  // ---------- Foto ----------
  $('fFoto').addEventListener('change', function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) { fotoAtual = e.target.result; render(); };
    reader.readAsDataURL(file);
  });

  // ---------- Bindings dos campos ----------
  campos.forEach(function (id) {
    $(id).addEventListener('input', render);
  });

  // ---------- Roster (turma) ----------
  function carregar() {
    try { turma = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch (e) { turma = []; }
  }
  function persistir() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(turma)); }
    catch (e) { alert('Não foi possível salvar (armazenamento cheio). Fotos muito grandes?'); }
  }

  function renderRoster() {
    var box = $('roster');
    box.innerHTML = '';
    $('rosterCount').textContent = turma.length ? '(' + turma.length + ')' : '';
    if (!turma.length) {
      box.innerHTML = '<div class="text-muted small text-center py-2">Nenhum colaborador salvo ainda.</div>';
      return;
    }
    turma.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'roster-item' + (m.id === editandoId ? ' active' : '');
      var foto = m.foto
        ? '<img src="' + m.foto + '">'
        : '<span class="ph"><i class="fa-solid fa-user"></i></span>';
      el.innerHTML = foto +
        '<div class="info"><b>' + escapeHtml(m.nome || 'Sem nome') + '</b>' +
        '<small>' + escapeHtml(m.cargo || '') + ' · ' + escapeHtml(m.matricula || '') + '</small></div>' +
        '<button class="btn btn-sm btn-link text-danger p-0 ms-1" title="Remover" data-del="' + m.id + '"><i class="fa-solid fa-trash"></i></button>';
      el.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-del]')) return;
        editar(m.id);
      });
      el.querySelector('[data-del]').addEventListener('click', function (ev) {
        ev.stopPropagation();
        remover(m.id);
      });
      box.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function preencherForm(m) {
    $('fNome').value = m.nome || '';
    $('fCargo').value = m.cargo || '';
    $('fMatricula').value = m.matricula || '';
    $('fPrefixo').value = m.prefixo || 'ENGC';
    $('fTel').value = m.tel || '';
    $('fEmail').value = m.email || '';
    $('fSite').value = m.site || '';
    $('fQR').value = m.qrBase || '';
    fotoAtual = m.foto || '';
  }

  function editar(id) {
    var m = turma.find(function (x) { return x.id === id; });
    if (!m) return;
    editandoId = id;
    preencherForm(m);
    render();
    renderRoster();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function remover(id) {
    if (!confirm('Remover este colaborador da turma?')) return;
    turma = turma.filter(function (x) { return x.id !== id; });
    if (editandoId === id) novoForm();
    persistir();
    renderRoster();
  }

  function salvar() {
    var d = lerForm();
    if (!d.nome) { alert('Informe ao menos o nome.'); return; }
    var idx = turma.findIndex(function (x) { return x.id === d.id; });
    if (idx >= 0) turma[idx] = d; else turma.push(d);
    editandoId = d.id;
    persistir();
    renderRoster();
  }

  function novoForm() {
    editandoId = null;
    fotoAtual = '';
    ['fNome', 'fCargo', 'fMatricula'].forEach(function (id) { $(id).value = ''; });
    $('fPrefixo').value = 'ENGC';
    render();
    renderRoster();
  }

  $('btnSalvar').addEventListener('click', salvar);
  $('btnNovo').addEventListener('click', novoForm);

  // ---------- Exportação PNG ----------
  // Usa modern-screenshot (foreignObject) — preserva clip-path, border-radius,
  // gradientes e fontes de ícone, ao contrário do html2canvas. Retorna um Blob PNG.
  function capturar(el) {
    return modernScreenshot.domToBlob(el, { scale: 3, backgroundColor: null });
  }

  function nomeArquivo(base, lado) {
    var n = ($('fNome').value.trim() || 'cracha').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'cracha-' + n + '-' + lado + '.png';
  }

  window.baixarLado = function (lado) {
    var el = lado === 'verso' ? $('cardVerso') : $('cardFrente');
    capturar(el).then(function (blob) {
      var a = document.createElement('a');
      a.download = nomeArquivo('cracha', lado);
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  // ---------- Imprimir turma ----------
  function montarCardHTML(m) {
    var full = idCompleto(m);
    var fotoHtml = m.foto
      ? '<img src="' + m.foto + '" alt="foto">'
      : '<div class="ph-empty"><i class="fa-solid fa-user"></i></div>';

    var qr = qrcode(0, 'M');
    qr.addData((m.qrBase || '') + full); qr.make();
    var qrImg = qr.createImgTag(6, 0).replace('<img', '<img style="width:100%;height:auto"');

    var frente =
      '<div class="cracha frente">' +
        '<span class="lanyard"></span>' +
        '<img class="fr-logo" src="assets/logo-engecom-navy.png">' +
        '<div class="fr-hero">' +
          '<div class="sh sh-steel"></div><div class="sh sh-navy"></div>' +
          '<div class="sh sh-blue2"></div><div class="sh sh-blue"></div>' +
          '<div class="fr-photo">' + fotoHtml + '</div>' +
        '</div>' +
        '<div class="fr-name">' + escapeHtml(m.nome || '') + '</div>' +
        '<div class="fr-cargo">' + escapeHtml(m.cargo || '') + '</div>' +
        '<div class="fr-div"></div>' +
        '<div class="fr-mat"><div class="fr-mat-ic"><i class="fa-solid fa-id-card-clip"></i></div>' +
          '<div class="fr-mat-txt"><div class="lab">MATRÍCULA</div><div class="num">' + escapeHtml(m.matricula || '') + '</div></div></div>' +
        '<div class="fr-values">' +
          '<div class="fr-val"><i class="fa-solid fa-shield-halved"></i><span>SEGURANÇA</span></div>' +
          '<div class="fr-val"><i class="fa-solid fa-handshake"></i><span>COMPROMISSO</span></div>' +
          '<div class="fr-val"><i class="fa-solid fa-helmet-safety"></i><span>QUALIDADE</span></div>' +
          '<div class="fr-val"><i class="fa-solid fa-people-group"></i><span>RESPEITO</span></div>' +
        '</div>' +
        '<div class="fr-foot"><i class="fa-solid fa-globe"></i>' + escapeHtml(m.site || '') + '</div>' +
      '</div>';

    var verso =
      '<div class="cracha verso">' +
        '<div class="vs-top"><span class="lanyard"></span><img src="assets/logo-engecom-white.png"></div>' +
        '<div class="vs-body"><div class="vs-info">' +
          '<div class="vs-item"><div class="ic"><i class="fa-solid fa-user"></i></div><div><div class="tt">Uso Obrigatório</div><div class="ds">Este crachá é de uso pessoal e intransferível.</div></div></div>' +
          '<div class="vs-item"><div class="ic"><i class="fa-solid fa-shield-halved"></i></div><div><div class="tt">Cuide bem do seu crachá</div><div class="ds">Em caso de perda, comunique imediatamente ao RH.</div></div></div>' +
          '<div class="vs-item"><div class="ic"><i class="fa-solid fa-reply"></i></div><div><div class="tt">Devolução</div><div class="ds">Este crachá deve ser devolvido em caso de desligamento.</div></div></div>' +
          '<div class="vs-item"><div class="ic"><i class="fa-solid fa-phone"></i></div><div><div class="tt">Contato</div><div class="ds">' + escapeHtml(m.tel || '') + '<br>' + escapeHtml(m.email || '') + '</div></div></div>' +
        '</div><div class="vs-qr"><div class="qrbox">' + qrImg + '</div>' +
          '<div class="qrlabel">VALIDAÇÃO</div><div class="qrcap">Escaneie o QR Code para validar este crachá.</div></div></div>' +
        '<div class="vs-barcode"><svg class="bc"></svg><div class="bid">ID: ' + escapeHtml(full) + '</div></div>' +
        '<div class="vs-tag"><div class="gear"><i class="fa-solid fa-gear"></i></div>' +
          '<div class="slogan">CONSTRUINDO <b>SOLUÇÕES.</b><br>GERANDO <b>VALOR.</b></div></div>' +
        '<div class="vs-foot"><i class="fa-solid fa-globe"></i>' + escapeHtml(m.site || '') + '</div>' +
      '</div>';

    return { frente: frente, verso: verso, barcodeVal: full };
  }

  $('btnImprimirTodos').addEventListener('click', function () {
    if (!turma.length) { alert('Adicione colaboradores à turma primeiro.'); return; }
    var area = $('printArea');
    var sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    var pendentes = [];
    turma.forEach(function (m) {
      var c = montarCardHTML(m);
      var pair = document.createElement('div');
      pair.className = 'print-pair';
      pair.innerHTML = c.frente + c.verso;
      sheet.appendChild(pair);
      pendentes.push({ svg: pair.querySelector('.bc'), val: c.barcodeVal });
    });
    area.innerHTML = '';
    area.appendChild(sheet);
    pendentes.forEach(function (p) {
      JsBarcode(p.svg, p.val, { format: 'CODE128', displayValue: false, margin: 0, height: 60, width: 2 });
    });
    setTimeout(function () { window.print(); }, 300);
  });

  // ---------- Baixar todos (.zip) ----------
  $('btnBaixarTodos').addEventListener('click', function () {
    if (!turma.length) { alert('Adicione colaboradores à turma primeiro.'); return; }
    if (typeof JSZip === 'undefined') { alert('Biblioteca de zip indisponível.'); return; }

    var btn = this;
    btn.disabled = true;
    var original = btn.innerHTML;

    var zip = new JSZip();
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(holder);

    var i = 0;
    function proximo() {
      if (i >= turma.length) {
        zip.generateAsync({ type: 'blob' }).then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'crachas-turma.zip';
          a.click();
          URL.revokeObjectURL(a.href);
          document.body.removeChild(holder);
          btn.disabled = false; btn.innerHTML = original;
        });
        return;
      }
      var m = turma[i];
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> ' + (i + 1) + '/' + turma.length;
      var c = montarCardHTML(m);
      holder.innerHTML = '<div class="print-pair" style="display:flex;gap:10px">' + c.frente + c.verso + '</div>';
      var cards = holder.querySelectorAll('.cracha');
      JsBarcode(holder.querySelector('.bc'), c.barcodeVal, { format: 'CODE128', displayValue: false, margin: 0, height: 60, width: 2 });

      var slug = (m.nome || ('cracha-' + (i + 1))).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // pequeno atraso p/ fontes/ícones renderizarem
      setTimeout(function () {
        capturar(cards[0]).then(function (blob1) {
          zip.file(slug + '-frente.png', blob1);
          return capturar(cards[1]);
        }).then(function (blob2) {
          zip.file(slug + '-verso.png', blob2);
          i++;
          proximo();
        }).catch(function (e) {
          console.error('Falha ao gerar', m.nome, e);
          i++;
          proximo();
        });
      }, 200);
    }
    proximo();
  });

  // ---------- Init ----------
  carregar();
  renderRoster();
  render();
})();
