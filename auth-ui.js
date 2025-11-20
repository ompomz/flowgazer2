// auth-ui.js - 新規作成
function createAuthUI() {
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(5px);
    z-index: 9998;
    display: none;
    justify-content: center;
    align-items: center;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #fff;
    padding: 2rem;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
  `;

  panel.innerHTML = `
    <h3 style="margin-bottom: 1rem;">Nostrアカウント</h3>
    <div id="auth-status"></div>
    <div id="auth-login" style="display: none;">
      <button id="nip07-login" class="container-button">NIP-07でログイン</button>
      <input type="password" id="nsec-input" placeholder="nsec1..." style="margin: 0.5rem 0; width: 100%;">
      <button id="nsec-login" class="container-button">nsecでログイン</button>
    </div>
    <div id="auth-info" style="display: none;">
      <p>公開鍵: <span id="auth-npub"></span></p>
      <button id="logout-btn" class="container-button">ログアウト</button>
    </div>
    <button id="close-auth" class="container-button" style="margin-top: 1rem;">閉じる</button>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  updateAuthUI();
  setupAuthEvents();
}

function updateAuthUI() {
  const loginDiv = document.getElementById('auth-login');
  const infoDiv = document.getElementById('auth-info');
  const npubSpan = document.getElementById('auth-npub');

  if (window.nostrAuth.isLoggedIn()) {
    loginDiv.style.display = 'none';
    infoDiv.style.display = 'block';
    const npub = NostrTools.nip19.npubEncode(window.nostrAuth.pubkey);
    npubSpan.textContent = npub.substring(0, 12) + '...' + npub.slice(-4);
    
    // 秘密鍵をコピーするボタンを追加（nsecログインの場合のみ）
    const existingNsecBtn = document.getElementById('copy-nsec-btn');
    if (window.nostrAuth.nsec && !window.nostrAuth.useNIP07 && !existingNsecBtn) {
      const nsecBtn = document.createElement('button');
      nsecBtn.id = 'copy-nsec-btn';
      nsecBtn.className = 'container-button';
      nsecBtn.textContent = '秘密鍵をコピー';
      nsecBtn.style.backgroundColor = '#ff99cc';
      nsecBtn.style.marginTop = '0.5rem';
      nsecBtn.onclick = () => {
        navigator.clipboard.writeText(window.nostrAuth.nsec)
          .then(() => alert('秘密鍵をコピーしました！必ず安全な場所に保存してください。'))
          .catch(err => alert('コピーに失敗しました: ' + err.message));
      };
      infoDiv.insertBefore(nsecBtn, document.getElementById('logout-btn'));
    }
  } else {
    loginDiv.style.display = 'block';
    infoDiv.style.display = 'none';
    // 秘密鍵コピーボタンを削除
    const nsecBtn = document.getElementById('copy-nsec-btn');
    if (nsecBtn) nsecBtn.remove();
  }
}

function setupAuthEvents() {
  document.getElementById('nip07-login').addEventListener('click', async () => {
    try {
      await window.nostrAuth.loginWithExtension();
      updateAuthUI();
      alert('ログインしました！');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('nsec-login').addEventListener('click', () => {
    const nsec = document.getElementById('nsec-input').value;
    try {
      window.nostrAuth.loginWithNsec(nsec);
      updateAuthUI();
      alert('ログインしました！');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    window.nostrAuth.logout();
    updateAuthUI();
    alert('ログアウトしました');
  });

  document.getElementById('close-auth').addEventListener('click', () => {
    document.getElementById('auth-overlay').style.display = 'none';
  });
}

function showAuthUI() {
  document.getElementById('auth-overlay').style.display = 'flex';
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
  createAuthUI();
});
