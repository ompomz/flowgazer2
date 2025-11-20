/**
 * 認証UI（オーバーレイ、パネル）を作成し、DOMに追加する関数
 */
function createAuthUI() {
    // オーバーレイ要素の作成とスタイリング
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
        display: none; /* 初期状態では非表示 */
        justify-content: center;
        align-items: center;
    `;

    // 認証パネル要素の作成とスタイリング
    const panel = document.createElement('div');
    panel.style.cssText = `
        background: #fff;
        padding: 2rem;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
    `;

    // パネルのinnerHTML（コンテンツ）設定
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

    // DOMに追加
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // UIの初期状態を更新
    updateAuthUI();

    // イベントリスナーを設定
    setupAuthEvents();
}

// ---

/**
 * ログイン状態に基づいて認証UIの表示を更新する関数
 */
function updateAuthUI() {
    const loginDiv = document.getElementById('auth-login');
    const infoDiv = document.getElementById('auth-info');
    const npubSpan = document.getElementById('auth-npub');

    if (window.nostrAuth.isLoggedIn()) {
        // ログイン中の場合
        loginDiv.style.display = 'none';
        infoDiv.style.display = 'block';

        // npubのエンコードと表示（短縮形）
        const npub = NostrTools.nip19.npubEncode(window.nostrAuth.pubkey);
        npubSpan.textContent = npub.substring(0, 12) + '...' + npub.slice(-4);

        // nsecでログインした場合に秘密鍵コピーボタンを追加
        const existingNsecBtn = document.getElementById('copy-nsec-btn');
        if (window.nostrAuth.nsec && !window.nostrAuth.useNIP07 && !existingNsecBtn) {
            const nsecBtn = document.createElement('button');
            nsecBtn.id = 'copy-nsec-btn';
            nsecBtn.className = 'container-button';
            nsecBtn.textContent = '秘密鍵をコピー';
            nsecBtn.style.backgroundColor = '#ff99cc';
            nsecBtn.style.marginTop = '0.5rem';

            // コピー処理のイベントリスナー
            nsecBtn.onclick = () => {
                navigator.clipboard.writeText(window.nostrAuth.nsec)
                    .then(() => alert('秘密鍵をコピーしました！必ず安全な場所に保存してください。'))
                    .catch(err => alert('コピーに失敗しました: ' + err.message));
            };

            infoDiv.insertBefore(nsecBtn, document.getElementById('logout-btn'));
        }
    } else {
        // 未ログインの場合
        loginDiv.style.display = 'block';
        infoDiv.style.display = 'none';

        // 秘密鍵コピーボタンを削除
        const nsecBtn = document.getElementById('copy-nsec-btn');
        if (nsecBtn) nsecBtn.remove();
    }
}

// ---

/**
 * 認証に関する各種イベントリスナーを設定する関数
 */
function setupAuthEvents() {
    // NIP-07 ログイン
    document.getElementById('nip07-login').addEventListener('click', async () => {
        try {
            await window.nostrAuth.loginWithExtension();
            updateAuthUI();
            updateLoginUI();
            alert('ログインしました！');
        } catch (e) {
            alert(e.message);
        }
    });

    // nsec ログイン
    document.getElementById('nsec-login').addEventListener('click', () => {
        const nsec = document.getElementById('nsec-input').value;
        try {
            window.nostrAuth.loginWithNsec(nsec);
            updateAuthUI();
            updateLoginUI();
            alert('ログインしました！');
        } catch (e) {
            alert(e.message);
        }
    });

    // ログアウト
    document.getElementById('logout-btn').addEventListener('click', () => {
        window.nostrAuth.logout();
        updateAuthUI();
        alert('ログアウトしました');
    });

    // UIを閉じる
    document.getElementById('close-auth').addEventListener('click', () => {
        document.getElementById('auth-overlay').style.display = 'none';
    });
}

// ---

/**
 * 認証UI全体を表示する関数
 */
function showAuthUI() {
    document.getElementById('auth-overlay').style.display = 'flex';
}

// ---

// DOMContentLoaded後に初期化関数を実行
document.addEventListener('DOMContentLoaded', () => {
    createAuthUI();
});
