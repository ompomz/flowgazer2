/**
 * channel.js - NIP-28 Public Chat 関連の処理
 */

const ChannelHandlers = {
    /**
     * Kind 40/41 (チャンネル情報) のレンダリング
     */
    renderMetadata: function (event) {
        const renderArea = document.getElementById('render-area');
        let metadata;

        try {
            metadata = JSON.parse(event.content);
        } catch (e) {
            console.error("チャンネルメタデータのパース失敗", e);
            renderArea.innerHTML = `<p>チャンネル情報の読み取りに失敗しました</p>`;
            return;
        }

        const name = metadata.name || '無名チャンネル';
        const about = metadata.about || '説明はありません';
        const picture = metadata.picture || '';

        renderArea.innerHTML = `
            <div class="channel-card" style="border: 2px solid #5851db; border-radius: 12px; padding: 20px; background: #fdfdfd;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                    ${picture ? `<img src="${picture}" style="width: 64px; height: 64px; border-radius: 8px; object-fit: cover;">` : `<div style="width: 64px; height: 64px; background: #eee; border-radius: 8px; display: grid; place-items: center;">💬</div>`}
                    <div>
                        <h2 style="margin: 0; font-size: 1.5rem;">${Components.utils.escape(name)}</h2>
                        <code style="font-size: 0.8rem; color: #888;">Kind 40 (Public Chat Channel)</code>
                    </div>
                </div>
                <p style="white-space: pre-wrap; color: #444; line-height: 1.6;">${Components.utils.escape(about)}</p>
                
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                    <button onclick="ChannelHandlers.fetchMessages('${event.id}')" style="background: #5851db; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer;">
                        このチャンネルのメッセージを読み込む
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Kind 42 (チャンネルメッセージ) 単体のレンダリング
     */
    renderMessage: async function (event) {
        const renderArea = document.getElementById('render-area');
        const channelId = event.tags.find(t => t[0] === 'e' && (t[3] === 'root' || !t[3]))?.[1];

        // --- hex を nevent に変換 ---
        let neventId = channelId || "";
        if (channelId) {
            try {
                neventId = NostrTools.nip19.neventEncode({ id: channelId });
            } catch (e) {
                console.error("nevent変換失敗", e);
            }
        }

        const contentHtml = await Components.utils.formatContent(event.content, event.tags);
        let profile = window.dataStore.getProfile(event.pubkey);

        // --- プロフィールがない場合の取得処理 ---
        if (!profile) {
            const subId = `profile-for-kind42-${event.pubkey.substring(0, 8)}`;
            relayManager.subscribe(subId, { kinds: [0], authors: [event.pubkey], limit: 1 }, (type, pEvent) => {
                if (type === 'EVENT' && pEvent) {
                    try {
                        const profileData = JSON.parse(pEvent.content);
                        window.dataStore.addProfile(event.pubkey, profileData);

                        // プロフィールが届いたので、再描画
                        this.renderMessage(event);
                    } catch (err) {
                        console.error("プロフィール解析失敗", err);
                    } finally {
                        relayManager.unsubscribe(subId);
                    }
                }
            });
        }

        // --- 描画処理 ---
        renderArea.innerHTML = `
        <div class="channel-context" style="font-size: 0.8rem; color: #888; margin-bottom: 10px;">
        kind:40 : <a href="?id=${neventId}">${neventId ? neventId.substring(0, 15) + '...' : 'unknown'}</a>
        </div>
        ${Components.eventBody(event, contentHtml, profile)}
    `;

        fetchRelatedData(event.id);
    },

    /**
     * 特定のチャンネル内のメッセージ一覧を取得
     */
    fetchMessages: async function (channelId) {
        const renderArea = document.getElementById('render-area');
        
        renderArea.innerHTML = `
            <div class="channel-chat-container">
                <div id="chat-header" style="padding: 10px; background: #5851db; color: white; border-radius: 8px 8px 0 0;">
                    <strong>💬 チャンネルチャット</strong>
                </div>
                <div id="chat-messages" style="border: 1px solid #ddd; height: 500px; overflow-y: auto; padding: 15px; background: #fff; display: flex; flex-direction: column; gap: 10px;">
                    <p id="chat-status" style="text-align: center; color: #888;">メッセージを読み込み中...</p>
                </div>
            </div>
        `;

        const chatList = document.getElementById('chat-messages');

        relayManager.subscribe(`channel-msgs-${channelId.substring(0,8)}`, { 
            kinds: [42], 
            '#e': [channelId], 
            limit: 50 
        }, async (type, event) => {
            if (type === 'EVENT' && event) {
                const status = document.getElementById('chat-status');
                if (status) status.remove();

                let profile = window.dataStore.getProfile(event.pubkey);
                if (!profile) {
                    this._fetchProfileForChat(event.pubkey);
                }

                const messageHtml = await this._createChatMessageHtml(event, profile);
                const msgDiv = document.createElement('div');
                msgDiv.id = `msg-${event.id}`;
                msgDiv.innerHTML = messageHtml;
                chatList.appendChild(msgDiv);
                chatList.scrollTop = chatList.scrollHeight;
            }
        });
    },

    // 内部用：プロフィールの動的取得
    _fetchProfileForChat: function (pubkey) {
        const subId = `p-${pubkey.substring(0,8)}`;
        relayManager.subscribe(subId, { kinds: [0], authors: [pubkey], limit: 1 }, (type, event) => {
            if (type === 'EVENT' && event) {
                const profileData = JSON.parse(event.content);
                window.dataStore.addProfile(pubkey, profileData);
                this._updateChatProfileUI(pubkey, profileData);
                relayManager.unsubscribe(subId);
            }
        });
    },

    // 内部用：チャットHTML生成
    _createChatMessageHtml: async function (event, profile) {
        const contentHtml = await Components.utils.formatContent(event.content, event.tags);
        const name = profile?.display_name || profile?.name || event.pubkey.substring(0, 8);
        const picture = profile?.picture || './favicon.ico';

        return `
            <div class="chat-row" style="display: flex; gap: 10px; align-items: flex-start;">
                <img src="${picture}" style="width: 32px; height: 32px; border-radius: 50%; background: #eee;">
                <div style="flex: 1;">
                    <div style="font-size: 0.75rem; color: #666;">
                        <span class="user-name-${event.pubkey}" style="font-weight: bold;">${Components.utils.escape(name)}</span> 
                        <span style="margin-left: 5px;">${new Date(event.created_at * 1000).toLocaleTimeString()}</span>
                    </div>
                    <div style="background: #f1f1f1; padding: 8px 12px; border-radius: 0 12px 12px 12px; display: inline-block; max-width: 90%; word-break: break-all;">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        `;
    },

    // 内部用：後から届いたプロフィールのUI反映
    _updateChatProfileUI: function (pubkey, profile) {
        const names = document.querySelectorAll(`.user-name-${pubkey}`);
        names.forEach(el => {
            el.textContent = profile.display_name || profile.name;
            const img = el.closest('.chat-row')?.querySelector('img');
            if (img && profile.picture) img.src = profile.picture;
        });
    }
};