// --- DOM要素の取得 ---
const mainEventContainer = document.getElementById('main-event');
const statusElement = document.getElementById('status');
const reactionsSection = document.getElementById('reactions-section');
const reactionsList = document.getElementById('reactions-list');
const relatedEventsSection = document.getElementById('related-events-section');
const relatedEventsList = document.getElementById('related-events-list');

// --- 定数 ---
const DEFAULT_PROFILE_IMAGE = 'https://ompomz.github.io/favicon.ico';
const FALLBACK_RELAYS = ['wss://r.ompomz.io/'];

const userProfiles = {}; 

// 1. SimplePool のインスタンスを定義（const pool の定義は一度だけ！）
const pool = new NostrTools.SimplePool(); 

// 2. プールにリレーを登録・接続し、イベントリスナーを設定する
FALLBACK_RELAYS.forEach(url => {
    try {
        // ensureRelay は成功すると Relay オブジェクトを返します
        const relay = pool.ensureRelay(url);
        
        // リレーオブジェクトを使ってイベントリスナーを設定
        relay.on('connect', () => {
            console.log(`✅ リレーに接続しました: ${url}`);
        });
        relay.on('disconnect', () => {
            console.warn(`⚠️ リレーから切断されました: ${url}`);
        });
        relay.on('error', () => {
            console.error(`❌ リレー接続エラー: ${url}`);
        });
        
    } catch (e) {
        // ensureRelay 自体でエラー（URL形式がおかしいなど）が発生した場合
        console.error(`接続プールの設定中にエラーが発生しました: ${url}`, e);
    }
});

// --- ユーティリティ関数 ---

function showStatus(message) {
    statusElement.textContent = message;
    if (message) {
        statusElement.classList.remove('hidden');
    } else {
        statusElement.classList.add('hidden');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(match) {
        const escape = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escape[match];
    });
}

/**
 * URLからNostr IDパラメータを取得し、対応する表示関数を呼び出す
 */
function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (id) {
        if (id.startsWith('npub1') || id.startsWith('nprofile1')) {
            renderProfileDetail(id);
        } else if (id.startsWith('note1') || id.startsWith('nevent1') || id.startsWith('naddr1')) {
            renderEventDetail(id);
        } else {
            showStatus('エラー: 無効なNostr ID形式です。');
            renderInputForm();
        }
    } else {
        renderInputForm();
    }
}


// --- 外部公開関数 (HTMLから呼び出される) ---

function goBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // Fallback URLは元のコードから引き継ぎ
        window.location.href = 'https://ompomz.github.io/tweetsrecap/tweet';
    }
}

function copyUrl() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert('URLがコピーされました！');
    }).catch(err => {
        console.error('URLのコピーに失敗しました:', err);
        alert('URLのコピーに失敗しました。');
    });
}

// NostrViewerというグローバルオブジェクトに公開関数をまとめる
window.NostrViewer = {
    goBack,
    copyUrl,
    // 開発中のデバッグ用
    renderEventDetail,
    renderProfileDetail
};


// --- プロフィール関連 ---

async function fetchProfiles(pubkeys) {
    console.log(`🔍 プロフィール取得を開始: ${pubkeys.length}件`);
    if (pubkeys.length === 0) return;

    const pubkeysToFetch = pubkeys.filter(pubkey => !userProfiles[pubkey]);
    if (pubkeysToFetch.length === 0) {
        console.log('✅ すでに全てのプロフィールがキャッシュされています。');
        return;
    }

    console.log(`🚀 新規プロフィールをリレーから取得: ${pubkeysToFetch.length}件`);
    const until = Math.floor(Date.now() / 1000);
    
    // SimplePool v2.x: list(filters, relays)
    const profiles = await pool.list({
        kinds: [0],
        authors: pubkeysToFetch,
        until: until
    });

    profiles.forEach(p => {
        try {
            userProfiles[p.pubkey] = JSON.parse(p.content);
            console.log(`✅ プロフィールをキャッシュしました: ${p.pubkey}`);
        } catch (e) {
            console.error('❌ プロフィールJSONのパースに失敗しました:', p.pubkey, e);
        }
    });
}

function createProfileHtml(pubkey, isLink = true) {
    const profile = userProfiles[pubkey] || {};
    const profilePicture = (profile.picture && profile.picture.trim() !== '') ? profile.picture : DEFAULT_PROFILE_IMAGE;
    // NostrTools v2.x: nip19エンコードの参照変更
    const npub = NostrTools.nip19.npubEncode(pubkey);

    const profileContentHtml = `
        <div class="profile">
            <img src="${profilePicture}" class="profile-image" alt="User profile image">
            <div>
                <span class="profile-name">${escapeHtml(profile.name || 'Unknown')}</span>
                <span class="profile-nip05">${profile.nip05 ? escapeHtml(profile.nip05) : npub.substring(0, 8) + '...' + npub.slice(-4)}</span>
            </div>
        </div>
    `;
    if (isLink) {
        const profileUrl = `?id=${npub}`;
        return `<a href="${profileUrl}" class="profile-link">${profileContentHtml}</a>`;
    } else {
        return profileContentHtml;
    }
}


// --- コンテンツ・フォーマット関連 ---

function replaceCustomEmojis(text, customEmojiMap) {
    // ロジックは元のコードから変更なし
    if (!text || customEmojiMap.size === 0) {
        return text;
    }

    let formattedText = text;
    customEmojiMap.forEach((url, shortcode) => {
        const regex = new RegExp(`(?<=\\s|^)${shortcode}(?=\\s|$)`, 'g');
        formattedText = formattedText.replace(regex, `<img src="${url}" alt="${shortcode}" class="custom-emoji custom-emoji-hover">`);
    });
    return formattedText;
}

async function formatPostContent(content, tags) {
    console.log('🔄 formatPostContent: 投稿内容のフォーマットを開始します');
    let formattedContent = escapeHtml(content);
    formattedContent = formattedContent.replace(/\n/g, '<br>');

    // URLを画像またはリンクに変換
    const urlRegex = /\b(https?:\/\/[^\s\u3000()\[\]{}。、！？\u4E00-\u9FFF]+)/g;    
    
    formattedContent = formattedContent.replace(urlRegex, (url) => {
        const imageExtensions = /\.(png|jpe?g|gif|webp|svg|heic|avif)$/i;
        if (imageExtensions.test(url)) {
            console.log(`🖼️ URLを画像タグに変換: ${url}`);
            // openModal は modal.js のグローバル関数として呼び出す想定
            return `<a href="#" onclick="event.preventDefault(); openModal('${url}')"><img src="${url}" alt="post image" class="post-image"></a>`;
        }
        console.log(`🔗 URLをリンクに変換: ${url}`);
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });


    // Nostr ID (note1, npub1など) をプレースホルダーに置き換え
    const nostrIdsToFetch = [];
    // NostrTools v2.x: nip19デコードの参照変更
    const placeholderRegex = /nostr:(n(?:event|note|pub|profile|addr)1\S+)/g;
    formattedContent = formattedContent.replace(placeholderRegex, (match, nip19) => {
        nostrIdsToFetch.push(nip19);
        console.log(`📄 Nostr IDをプレースホルダーに置き換え: ${nip19}`);
        return `<div data-nostr-id="${nip19}"></div>`;
    });

    // カスタム絵文字の適用
    const customEmojis = tags.filter(t => t[0] === 'emoji');
    const customEmojiMap = new Map();
    customEmojis.forEach(([_, shortcode, url]) => {
        customEmojiMap.set(`:${shortcode}:`, url);
    });
    formattedContent = replaceCustomEmojis(formattedContent, customEmojiMap);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedContent;

    // 非同期でNostrカードを取得して埋め込む
    console.log(`🚀 ${nostrIdsToFetch.length}個のNostrカードを非同期で取得開始...`);
    await Promise.all(nostrIdsToFetch.map(async (nostrId) => {
        const cardHtml = await createNostrCard(nostrId);
        const placeholder = tempDiv.querySelector(`[data-nostr-id="${nostrId}"]`);
        if (placeholder) {
            placeholder.outerHTML = cardHtml;
            console.log(`✅ Nostrカードを挿入完了: ${nostrId}`);
        } else {
            console.warn(`⚠️ プレースホルダーが見つかりません: ${nostrId}`);
        }
    }));

    console.log('🎉 formatPostContent: 処理完了');
    return tempDiv.innerHTML;
}

// イベント種別ラベルの取得
function getPostTypeLabel(kind) {
    switch (kind) {
        case 1: return '投稿';
        case 6: return 'リポスト';
        case 7: return 'リアクション';
        case 40: return 'チャンネル作成';
        case 41: return 'チャンネル情報更新';
        case 42: return 'チャンネルメッセージ';
        case 30023: return 'ロングフォームコンテンツ'; // NIP-23
        default: return 'イベント';
    }
}


// --- Nostrカード生成 (埋め込み表示) ---

async function createNostrCard(nostrId) {
    console.log(`Nostrカードを生成中: ${nostrId}`);
    let decoded;
    try {
        // NostrTools v2.x: nip19デコードの参照変更
        decoded = NostrTools.nip19.decode(nostrId);
    } catch (e) {
        console.error(`無効なNostr ID: ${nostrId}`, e);
        return `<div class="error-card">無効なNostr ID</div>`;
    }

    const relays = (decoded.data.relays && decoded.data.relays.length > 0) ? decoded.data.relays : FALLBACK_RELAYS;
    const until = Math.floor(Date.now() / 1000);
    let event;

    if (decoded.type === 'npub' || decoded.type === 'nprofile') {
        // プロフィールカードの処理
        const pubkey = decoded.data.id || decoded.data;
        // SimplePool v2.x: get(filter, relays)
        const profileEvent = await pool.get({
            kinds: [0],
            authors: [pubkey],
            until: until,
            limit: 1
        }, relays);

        if (profileEvent) {
            // ... (HTML生成ロジックは元のコードから変更なし)
            const profile = JSON.parse(profileEvent.content);
            const npub = NostrTools.nip19.npubEncode(pubkey);
            const profileHtml = `
                <a href="?id=${npub}">
                    <div class="related-post-card">
                        ${createProfileHtml(pubkey)}
                        <div class="post-info">
                            <span>${npub.substring(0, 8) + '...' + npub.slice(-4)}</span>
                        </div>
                        <div class="post-content">
                            <p class="post-text">${escapeHtml(profile.about || '')}</p>
                        </div>
                    </div>
                </a>`;
            console.log('プロフィールカード生成完了');
            return profileHtml;
        }
    } else if (decoded.type === 'note' || decoded.type === 'nevent') {
        // イベントカードの処理
        const eventId = decoded.data.id || decoded.data;
        // SimplePool v2.x: get(filter, relays)
        event = await pool.get({
            ids: [eventId],
            until: until,
            limit: 1
        }, relays);
    } else if (decoded.type === 'naddr') {
        // naddr (Parameterized Replaceable Events) の処理
        // SimplePool v2.x: get(filter, relays)
        event = await pool.get({
            authors: [decoded.data.pubkey],
            kinds: [decoded.data.kind],
            '#d': [decoded.data.identifier],
            until: until,
            limit: 1
        }, relays);
    } else {
        console.warn(`対応していないIDタイプ: ${decoded.type}`);
        return `<div class="error-card">対応していないIDタイプです</div>`;
    }

    if (!event) {
        console.warn(`イベントが見つかりませんでした: ${nostrId}`);
        return `<div class="related-post-card">イベントが見つかりませんでした</div>`;
    }

    // イベントカードの HTML 生成 (元のコードからロジックは変更なし)
    await fetchProfiles([event.pubkey]);
    const date = new Date(event.created_at * 1000).toLocaleString();
    const content = await formatPostContent(event.content.length > 150 ? event.content.substring(0, 150) + '...' : event.content, event.tags);
    const postTypeLabel = getPostTypeLabel(event.kind);
    const eventUrl = `?id=${nostrId}`;

    const eventHtml = `
        <a href="${eventUrl}">
            <div class="related-post-card">
                ${createProfileHtml(event.pubkey)}
                <div class="post-info">
                    <span>${date}</span>
                    <span>${postTypeLabel}</span>
                </div>
                <div class="post-content">
                    <p class="post-text">${content}</p>
                </div>
            </div>
        </a>`;
    console.log('イベントカード生成完了');
    return eventHtml;
}


// --- メインレンダリングロジック ---

async function renderMainEvent(event, customEmojiMap) {
    console.log(`✨ メインイベントのレンダリングを開始: kind=${event.kind}, id=${event.id}`);
    const date = new Date(event.created_at * 1000).toLocaleString();
    const client = event.tags.find(t => t[0] === 'client')?.[1] || '';
    let contentHtml;

    // kind 30023 (NIP-23 Long-form Content) の場合は marked.js でMarkdownをパース
    if (event.kind === 30023) {
        // marked.js の参照変更
        contentHtml = marked.parse(event.content);
    } else {
        contentHtml = await formatPostContent(event.content, event.tags);
    }

    const html = `
        ${createProfileHtml(event.pubkey)}
        <div class="post-content">${contentHtml}</div>
        <div class="post-info">
            <span>${date}</span>
            ${client ? `<span>via ${escapeHtml(client)}</span>` : ''}
        </div>
    `;
    mainEventContainer.innerHTML = html;
    console.log('✅ メインイベントのレンダリングが完了しました');
}

function renderReactions(reactions, customEmojiMap) {
    // ロジックは元のコードから変更なし
    console.log(`👍 リアクションのレンダリングを開始: ${reactions.length}件`);
    const reactionGroups = new Map();

    reactions.forEach(reaction => {
        const emoji = reaction.content.trim();
        if (!reactionGroups.has(emoji)) {
            reactionGroups.set(emoji, {
                count: 0,
                pubkeys: new Set()
            });
        }
        const group = reactionGroups.get(emoji);
        group.count++;
        group.pubkeys.add(reaction.pubkey);
    });

    reactionsList.innerHTML = '';
    for (const [emoji, group] of reactionGroups.entries()) {
        const avatarsHtml = Array.from(group.pubkeys).map(pubkey => {
            const profile = userProfiles[pubkey] || {};
            const profilePicture = (profile.picture && profile.picture.trim() !== '') ? profile.picture : DEFAULT_PROFILE_IMAGE;
            const npub = NostrTools.nip19.npubEncode(pubkey);
            const profileUrl = `?id=${npub}`;
            return `<a href="${profileUrl}"><img src="${profilePicture}" class="reaction-avatar" alt="reaction user avatar"></a>`;
        }).join('');

        let displayedEmojiHtml = replaceCustomEmojis(emoji, customEmojiMap);
        if (displayedEmojiHtml === emoji) {
            const displayedEmoji = emoji === '+' ? '⭐' : emoji;
            displayedEmojiHtml = `<span class="reaction-emoji">${displayedEmoji}</span>`;
        }

        const groupHtml = `
            <div class="reaction-group">
                ${displayedEmojiHtml}
                <div class="reaction-avatars">${avatarsHtml}</div>
            </div>
        `;
        reactionsList.innerHTML += groupHtml;
    }
    reactionsSection.style.display = 'block';
    console.log('✅ リアクションのレンダリングが完了しました');
}

async function renderRelatedEvents(posts, reposts, quotes) {
    // ロジックは元のコードから変更なし
    console.log(`🔗 関連イベントのレンダリングを開始: 投稿(${posts.length}), リポスト(${reposts.length}), 引用(${quotes.length})`);
    const allRelatedEvents = [...posts, ...reposts, ...quotes];
    allRelatedEvents.sort((a, b) => b.created_at - a.created_at);

    relatedEventsList.innerHTML = '';
    for (const event of allRelatedEvents) {
        const date = new Date(event.created_at * 1000).toLocaleString();
        let postContentHtml = '';
        let postTypeLabel = '';

        switch (event.kind) {
            case 1:
                postTypeLabel = 'リプライ';
                postContentHtml = `<div class="post-content">${await formatPostContent(event.content, event.tags)}</div>`;
                break;
            case 6:
                postTypeLabel = 'リポスト';
                const repostUser = userProfiles[event.pubkey] || {
                    name: 'Unknown'
                };
                postContentHtml = `<div class="post-content">${escapeHtml(repostUser.name)}さんがリポストしました</div>`;
                break;
            case 16:
                postTypeLabel = '引用';
                postContentHtml = `<div class="post-content">${await formatPostContent(event.content, event.tags)}</div>`;
                break;
        }

        const html = `
            <div class="related-post-card">
                ${createProfileHtml(event.pubkey)}
                <div class="post-info">
                    <span>${date}</span>
                    <span>${postTypeLabel}</span>
                </div>
                ${postContentHtml}
            </div>
        `;
        relatedEventsList.innerHTML += html;
    }
    relatedEventsSection.style.display = 'block';
    console.log('✅ 関連イベントのレンダリングが完了しました');
}

/**
 * イベント詳細ビューのレンダリング
 */
async function renderEventDetail(nostrId) {
    showStatus('イベントデータを取得中...');
    console.log(`🔍 イベント詳細の取得を開始: ${nostrId}`);
    try {
        // NostrTools v2.x: nip19デコードの参照変更
        const decoded = NostrTools.nip19.decode(nostrId);
        const relays = (decoded.data.relays && decoded.data.relays.length > 0) ? decoded.data.relays : FALLBACK_RELAYS;
        const until = Math.floor(Date.now() / 1000);
        let eventId;
        let filters = {};

        switch (decoded.type) {
            case 'note':
            case 'nevent':
                eventId = decoded.data.id || decoded.data;
                filters = {
                    ids: [eventId]
                };
                console.log('📄 note/nevent IDを検出');
                break;
            case 'naddr':
                eventId = decoded.data.id;
                filters = {
                    authors: [decoded.data.pubkey],
                    kinds: [decoded.data.kind],
                    '#d': [decoded.data.identifier]
                };
                console.log('📌 naddr IDを検出');
                break;
            default:
                showStatus('エラー: 無効なID形式です。');
                console.error('❌ 無効なID形式です:', decoded.type);
                return;
        }

        // SimplePool v2.x: get(filter, relays)
        const mainEventPromise = pool.get({...filters,
            until: until,
            limit: 1
        }, relays);
        
        // SimplePool v2.x: list(filters, relays) - 関連イベント（リプライ、リアクション、リポストなど）を取得
        const relatedEventsPromise = pool.list([{
            '#e': [eventId],
            kinds: [1, 6, 7, 16], // kind 1: Post/Reply, 6: Repost, 7: Reaction, 16: Quote
            until: until
        }], relays);

        console.log('⏳ メインイベントと関連イベントのデータを同時に取得中...');
        const [mainEvent, relatedEvents] = await Promise.all([mainEventPromise, relatedEventsPromise]);

        if (!mainEvent) {
            showStatus('イベントが見つかりませんでした');
            console.warn('⚠️ メインイベントが見つかりませんでした。');
            return;
        }
        console.log(`✅ メインイベントが見つかりました: kind=${mainEvent.kind}`);

        // 絵文字マップの構築
        const allEventsWithTags = [mainEvent, ...relatedEvents];
        const customEmojiMap = new Map();
        allEventsWithTags.forEach(event => {
            event.tags.filter(t => t[0] === 'emoji').forEach(([_, shortcode, url]) => {
                if (!customEmojiMap.has(`:${shortcode}:`)) {
                    customEmojiMap.set(`:${shortcode}:`, url);
                }
            });
        });

        // プロフィールの事前取得
        const pubkeysToFetch = new Set();
        pubkeysToFetch.add(mainEvent.pubkey);
        relatedEvents.forEach(e => pubkeysToFetch.add(e.pubkey));
        console.log(`👤 関連プロフィールをキャッシュに読み込み中: ${pubkeysToFetch.size}件`);
        await fetchProfiles(Array.from(pubkeysToFetch));

        // メインイベントのレンダリング
        await renderMainEvent(mainEvent, customEmojiMap);

        // 関連イベントの分類とレンダリング
        const reactions = relatedEvents.filter(e => e.kind === 7);
        const posts = relatedEvents.filter(e => e.kind === 1);
        const reposts = relatedEvents.filter(e => e.kind === 6);
        const quotes = relatedEvents.filter(e => e.kind === 16);

        if (reactions.length > 0) {
            renderReactions(reactions, customEmojiMap);
        }
        if (posts.length > 0 || reposts.length > 0 || quotes.length > 0) {
            renderRelatedEvents(posts, reposts, quotes);
        }

        showStatus('');
        console.log('🎉 すべての処理が完了しました。');
    } catch (err) {
        console.error('❌ イベントの取得中にエラーが発生しました:', err);
        showStatus('イベントの取得中にエラーが発生しました。');
    }
}

/**
 * プロフィール詳細ビューのレンダリング
 */
async function renderProfileDetail(nostrId) {
    showStatus('プロフィール情報を取得中...');
    console.log(`🔍 プロフィール詳細の取得を開始: ${nostrId}`);
    try {
        // NostrTools v2.x: nip19デコードの参照変更
        const decoded = NostrTools.nip19.decode(nostrId);
        if (decoded.type !== 'npub' && decoded.type !== 'nprofile') {
            showStatus('エラー: 無効なnpubまたはnprofile形式です。');
            console.error('❌ 無効なプロフィールID形式です:', decoded.type);
            return;
        }

        const relays = (decoded.data.relays && decoded.data.relays.length > 0) ? decoded.data.relays : FALLBACK_RELAYS;
        const pubkey = decoded.data.id || decoded.data;
        const until = Math.floor(Date.now() / 1000);

        console.log(`🚀 リレーからプロフィールイベントを取得中: ${pubkey}`);
        // SimplePool v2.x: get(filter, relays)
        const profileEvent = await pool.get({
            kinds: [0],
            authors: [pubkey],
            until: until,
            limit: 1
        }, relays);

        if (!profileEvent) {
            showStatus('プロフィールが見つかりませんでした。');
            console.warn('⚠️ プロフィールイベントが見つかりませんでした。');
            return;
        }
        console.log('✅ プロフィールイベントが見つかりました。');
        const profile = JSON.parse(profileEvent.content);
        // NostrTools v2.x: nip19エンコードの参照変更
        const npub = NostrTools.nip19.npubEncode(pubkey);

        function formatAboutContent(content, tags) {
            // ロジックは元のコードから変更なし
            console.log('📝 About meの内容をフォーマット中...');
            if (!content) return '';

            let formattedContent = escapeHtml(content);
            formattedContent = formattedContent.replace(/\n/g, '<br>');

            const customEmojis = tags.filter(t => t[0] === 'emoji');
            const customEmojiMap = new Map();
            customEmojis.forEach(([_, shortcode, url]) => {
                const imageTag = `<img src="${url}" alt="${shortcode}" class="custom-emoji">`;
                customEmojiMap.set(`:${shortcode}:`, imageTag);
            });

            customEmojiMap.forEach((imageTag, shortcode) => {
                const regex = new RegExp(shortcode.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                formattedContent = formattedContent.replace(regex, imageTag);
            });

            formattedContent = formattedContent.replace(/(https?:\/\/[^\s]+)/g, (url) => {
                if (url.includes('imgur.com')) {
                    return url;
                }
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
            });
            console.log('✅ About meのフォーマットが完了しました。');
            return formattedContent;
        }

        const aboutHtml = formatAboutContent(profile.about, profileEvent.tags);

        const html = `
            <div class="profile-card">
                <div class="profile-header">
                    <img src="${profile.picture || DEFAULT_PROFILE_IMAGE}" alt="Profile Picture" class="profile-picture">
                    <div class="profile-info-container">
                        <h2 class="profile-name">${escapeHtml(profile.name)}</h2>
                        <div class="npub-container">
                            <span id="npub-text" class="npub-text">${npub}</span>
                            <svg id="copy-npub-icon" class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </div>
                        <p class="nip05">${profile.nip05 ? escapeHtml(profile.nip05) : 'NIP-05未設定'}</p>
                    </div>
                </div>
                <p class="about-text">${aboutHtml}</p>
            </div>`;

        mainEventContainer.innerHTML = html;

        const copyIcon = document.getElementById('copy-npub-icon');
        const npubText = document.getElementById('npub-text');
        copyIcon.onclick = async () => {
            try {
                await navigator.clipboard.writeText(npub);
                alert('npubがクリップボードにコピーされました！');
            } catch (err) {
                console.error('npubのコピーに失敗しました:', err);
                alert('npubのコピーに失敗しました。');
            }
        };

        showStatus('');
        console.log('🎉 プロフィール詳細の表示が完了しました。');
    } catch (err) {
        console.error('❌ プロフィール取得中にエラー:', err);
        showStatus('プロフィールの取得中にエラーが発生しました。');
    }
}

/**
 * 入力フォームビューのレンダリング
 */
function renderInputForm() {
    mainEventContainer.innerHTML = `
        <div class="input-form-container">
            <p class="form-title">イベントまたはユーザーのNostr IDを入力してください</p>
            <form id="nostr-form" class="nostr-form">
                <input type="text" id="nostr-id-input" placeholder="nevent1..., npub1..." required class="form-input">
                <button type="submit" class="form-button">表示</button>
            </form>
        </div>`;

    const form = document.getElementById('nostr-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('nostr-id-input').value.trim();
        if (input.startsWith('note1') || input.startsWith('nevent1') || input.startsWith('naddr1') ||
            input.startsWith('npub1') || input.startsWith('nprofile1')) {
            window.location.href = `?id=${input}`;
        } else {
            alert('有効なNostr ID (note1, nevent1, naddr1, npub1, nprofile1) を入力してください。');
        }
    });
}

// --- 初期化 ---

window.onload = () => {
    // アプリケーションのコアな初期化処理のみを残します
    initializeApp();
};