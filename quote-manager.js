/**
 * quote-manager.js
 * 投稿内の nostr:nevent1... などの引用を展開する
 */
const QuoteManager = {
    /**
     * ページ内のプレースホルダーをスキャンして中身を読み込む
     */
    scanAndRender: async function() {
        const placeholders = document.querySelectorAll('.quote-placeholder:not([data-loaded="true"])');

        for (const el of placeholders) {
            const nip19Id = el.dataset.id;
            try {
                const decoded = NostrTools.nip19.decode(nip19Id);
                const targetId = decoded.data.id || decoded.data;
                const relays = (decoded.data.relays && decoded.data.relays.length > 0) 
                               ? decoded.data.relays 
                               : ["wss://relay.damus.io/", "wss://nos.lol/"]; // Fallback

                // 読み込み中マーク
                el.dataset.loaded = "true";

                // 1. イベント本体を取得
                // fetchSingleEvent的な処理をここで行う
                relayManager.subscribe(`quote-${targetId}`, { ids: [targetId], limit: 1 }, async (type, event) => {
                    if (type === 'EVENT' && event) {
                        // 内容を成形
                        const contentHtml = await Components.utils.formatContent(event.content, event.tags);
                        
                        // 2. プロフィールを ProfileFetcher にリクエスト
                        // すでにキャッシュがあれば即座に、なければバッチ取得される
                        const profile = window.dataStore.getProfile(event.pubkey);
                        if (!profile) {
                            window.profileFetcher.request(event.pubkey);
                        }

                        // 3. カードを描画（プロフィールがあれば使い、なければUnknown状態で出す）
                        el.innerHTML = Components.quoteCard(targetId, contentHtml, profile || {});
                        
                        relayManager.unsubscribe(`quote-${targetId}`);
                    }
                });

            } catch (e) {
                console.error("引用の展開に失敗:", e);
                el.innerHTML = `<span class="error">引用エラー</span>`;
            }
        }
    }
};