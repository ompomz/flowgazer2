/**
 * view-state.js
 * 【責務】: タブ状態管理、表示判定、フィルタリング
 */

const KIND_TEXT_NOTE = 1;
const KIND_REPOST = 6;
const KIND_REACTION = 7;
const KIND_CHANNEL = 42;
const RENDER_DELAY_MS = 300;

class ViewState {
  constructor() {
    // ===== タブ状態管理 =====
    this.tabs = {
      global: {
        visibleEventIds: new Set(),
        cursor: null,
        filter: { kinds: [KIND_TEXT_NOTE, KIND_REPOST] }
      },
      following: {
        visibleEventIds: new Set(),
        cursor: null,
        filter: { kinds: [KIND_TEXT_NOTE, KIND_REPOST] }
      },
      myposts: {
        visibleEventIds: new Set(),
        cursor: null,
        filter: { kinds: [KIND_TEXT_NOTE, KIND_CHANNEL] }
      },
      likes: {
        visibleEventIds: new Set(),
        cursor: null,
        filter: { kinds: [KIND_REACTION, KIND_REPOST, KIND_TEXT_NOTE] }
      }
    };

    // ===== 表示最適化キャッシュ =====
    this.selfFeed = []; // 自分のkind:1投稿を時系列順に保持

    // ===== 現在の状態 =====
    this.currentTab = 'global';
    this.renderTimer = null;
    this.renderDelay = RENDER_DELAY_MS;

    console.log('✅ ViewState初期化完了');
  }

  // ========================================
  // イベント受信処理 (ライブストリーム)
  // ========================================

  /**
   * 新規イベントを受信したときの処理
   * @param {Object} event - Nostrイベント
   * @returns {boolean} いずれかのタブに追加された場合true
   */
  onEventReceived(event) {
    const myPubkey = window.nostrAuth?.pubkey;
    
    // 振り分け先タブを判定
    const tabs = this._determineTargetTabs(event, myPubkey);
    
    if (tabs.length === 0) {
      return false;
    }

    // 各タブに追加
    let addedToCurrentTab = false;
    tabs.forEach(tab => {
      const added = this._addEventToTab(event, tab);
      if (added && tab === this.currentTab) {
        addedToCurrentTab = true;
      }
    });

    // selfFeedの更新 (自分のkind:1投稿)
    if (event.kind === KIND_TEXT_NOTE && event.pubkey === myPubkey) {
      this._addToSelfFeed(event);
    }

    // 現在のタブに追加された場合のみ描画スケジュール
    if (addedToCurrentTab) {
      this.scheduleRender();
    }

    return tabs.length > 0;
  }

/**
 * イベントがどのタブに属するかを判定
 * @private
 * @param {Object} event
 * @param {string|null} myPubkey
 * @returns {string[]} タブ名の配列
 */
_determineTargetTabs(event, myPubkey) {
  const tabs = [];

  // === Global / Following / MyPosts ===
  if ([KIND_TEXT_NOTE, KIND_REPOST, KIND_CHANNEL].includes(event.kind)) {
    
    // ===== Global/Following への追加判定 =====
    let shouldAddToPublicTabs = true;
    
    // 1. 自分の投稿は global/following に追加しない
    if (event.pubkey === myPubkey) {
      shouldAddToPublicTabs = false;
    }
    
    // 2. pタグに自分が含まれる場合（リプライ・メンション）も除外
    if (shouldAddToPublicTabs) {
      const mentionsMe = event.tags.some(t => t[0] === 'p' && t[1] === myPubkey);
      if (mentionsMe) {
        shouldAddToPublicTabs = false;
      }
    }
    
    // 3. kind:6（リツイート）で、元投稿が自分のものなら除外
    if (shouldAddToPublicTabs && event.kind === KIND_REPOST) {
      const repostedEventId = event.tags.find(t => t[0] === 'e')?.[1];
      if (repostedEventId) {
        const originalEvent = window.dataStore.getEvent(repostedEventId);
        if (originalEvent && originalEvent.pubkey === myPubkey) {
          shouldAddToPublicTabs = false;
        }
      }
    }
    
    // Global タブへ追加
    if (shouldAddToPublicTabs) {
      tabs.push('global');
      
      // フォロー中なら following タブにも
      if (window.dataStore.isFollowing(event.pubkey)) {
        tabs.push('following');
      }
    }

    // ===== MyPosts タブへの追加判定 =====
    // 自分の投稿なら myposts タブへ
    if ([KIND_TEXT_NOTE, KIND_CHANNEL].includes(event.kind) && event.pubkey === myPubkey) {
      tabs.push('myposts');
    }
  }

  // === Likes (自分宛のリアクション/リポスト/メンション) ===
  if ([KIND_REACTION, KIND_REPOST, KIND_TEXT_NOTE].includes(event.kind) && myPubkey) {
    const targetPubkey = event.tags.find(t => t[0] === 'p')?.[1];
    if (targetPubkey === myPubkey) {
      tabs.push('likes');
    }
  }

  return tabs;
}

  /**
   * イベントを指定タブに追加
   * @private
   */
  _addEventToTab(event, tab) {
    const tabState = this.tabs[tab];
    if (!tabState) return false;

    // 重複チェック
    if (tabState.visibleEventIds.has(event.id)) {
      return false;
    }

    // 追加
    tabState.visibleEventIds.add(event.id);

    // カーソル更新
    this._updateCursor(tabState, event.created_at);

    return true;
  }

  /**
   * カーソル (until/since) を更新
   * @private
   */
  _updateCursor(tabState, created_at) {
    if (!tabState.cursor) {
      tabState.cursor = { until: created_at, since: created_at };
      return;
    }

    if (created_at < tabState.cursor.until) {
      tabState.cursor.until = created_at;
    }
    if (created_at > tabState.cursor.since) {
      tabState.cursor.since = created_at;
    }
  }

  // ========================================
  // selfFeed管理 (表示最適化)
  // ========================================

  /**
   * selfFeedに追加
   * @private
   */
  _addToSelfFeed(event) {
    // 重複チェック
    if (this.selfFeed.find(e => e.id === event.id)) {
      return;
    }

    this.selfFeed.push(event);
    
    // 時系列順を保つ
    this.selfFeed.sort((a, b) => b.created_at - a.created_at);

    // 最大200件に制限
    if (this.selfFeed.length > 200) {
      this.selfFeed = this.selfFeed.slice(0, 200);
    }
  }

  // ========================================
  // 履歴イベント処理 (LoadMore)
  // ========================================

  /**
   * 履歴イベントを指定タブに追加
   * @param {Object} event
   * @param {string} tab
   * @returns {boolean}
   */
  addHistoryEventToTab(event, tab) {
    const added = this._addEventToTab(event, tab);

    if (added && tab === this.currentTab) {
      this.scheduleRender();
    }

    return added;
  }

  // ========================================
  // タブ切り替え
  // ========================================

  /**
   * タブを切り替え
   * @param {string} newTab
   */
  switchTab(newTab) {
    if (!this.tabs[newTab]) {
      console.error(`❌ ViewState: 不明なタブ名: ${newTab}`);
      return;
    }

    const oldTab = this.currentTab;
    console.log(`📑 ViewState: タブ切り替え ${oldTab} → ${newTab}`);

    this.currentTab = newTab;

    // タブの表示内容を再構築
    this._repopulateTab(newTab);

    // 即座に描画
    this.renderNow();
  }

  /**
   * タブの表示内容を全イベントから再構築
   * @private
   */
  _repopulateTab(tab) {
    const tabState = this.tabs[tab];
    if (!tabState) return;

    console.log(`🔄 タブ "${tab}" を再構築中...`);

    // クリア
    tabState.visibleEventIds.clear();
    tabState.cursor = null;

    // 全イベントから対象を抽出
    const allEvents = window.dataStore.getAllEvents();
    const myPubkey = window.nostrAuth?.pubkey;

    allEvents.forEach(event => {
      if (this._shouldShowInTab(event, tab, myPubkey)) {
        tabState.visibleEventIds.add(event.id);
        this._updateCursor(tabState, event.created_at);
      }
    });

    console.log(`✅ タブ "${tab}" 再構築完了: ${tabState.visibleEventIds.size}件`);
  }

  /**
   * イベントが指定タブに表示されるべきかを判定
   * @private
   */
  _shouldShowInTab(event, tab, myPubkey) {
    const tabState = this.tabs[tab];

    // kind制約
    if (!tabState.filter.kinds.includes(event.kind)) {
      return false;
    }

    switch (tab) {
      case 'global':

      // 自分の投稿を除外 (kind:1, 6, 42)
      if (event.pubkey === myPubkey && [KIND_TEXT_NOTE, KIND_REPOST, KIND_CHANNEL].includes(event.kind)) {
        return false;
        }

      // pタグに自分が含まれるものを除外（リプライ・メンション）
      const mentionsMe = event.tags.some(t => t[0] === 'p' && t[1] === myPubkey);
      if (mentionsMe) {
        return false;
      }

      // kind:6（リツイート）で、eタグが指す投稿が自分のものなら除外
      if (event.kind === KIND_REPOST) {
        const repostedEventId = event.tags.find(t => t[0] === 'e')?.[1];
        if (repostedEventId) {
          const originalEvent = window.dataStore.getEvent(repostedEventId);
          if (originalEvent && originalEvent.pubkey === myPubkey) {
            return false;
          }
        }
      }
  
  return true;


      case 'myposts':
        return event.pubkey === myPubkey;

      case 'likes':
        const targetPubkey = event.tags.find(t => t[0] === 'p')?.[1];
        return targetPubkey === myPubkey;

      default:
        return false;
    }
  }

  // ========================================
  // 表示用イベント取得
  // ========================================

  /**
   * 指定タブの表示イベントを取得 (フィルタリング済み・ソート済み)
   * @param {string} tab
   * @param {Object} filterOptions - { flowgazerOnly, authors }
   * @returns {Object[]}
   */
  getVisibleEvents(tab, filterOptions = {}) {
    const tabState = this.tabs[tab];
    if (!tabState) return [];

    let events;

    // === Global/Following: selfFeedと合成 ===
    if (tab === 'global' || tab === 'following') {
      events = this._getMergedFeed(tab);
    } else {
      // 通常取得
      events = Array.from(tabState.visibleEventIds)
        .map(id => window.dataStore.getEvent(id))
        .filter(Boolean);
    }

    // === 追加フィルタリング ===
    events = this._applyFilters(events, tab, filterOptions);

    // === ソート ===
    return events.sort((a, b) => {
      const dateDiff = b.created_at - a.created_at;
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * selfFeedとの合成フィード取得
   * @private
   */
  _getMergedFeed(tab) {
    const tabState = this.tabs[tab];
    
    // 他人のイベント取得
    const otherEvents = Array.from(tabState.visibleEventIds)
      .map(id => window.dataStore.getEvent(id))
      .filter(Boolean);

    // 最新の他人投稿のタイムスタンプ
    const latestOthers = otherEvents[0]?.created_at ?? 0;

    // 自分の投稿から新しいものだけ抽出
    const recentMine = this.selfFeed.filter(p => p.created_at > latestOthers);

    // 合成
    return [...recentMine, ...otherEvents];
  }

  /**
   * 追加フィルタを適用
   * @private
   */
  _applyFilters(events, tab, options) {
    const { flowgazerOnly = false, authors = null, showKind42 = false } = options;

    // 0. kind:42 フィルタ (global/following のみ)
    if ((tab === 'global' || tab === 'following') && !showKind42) {
      events = events.filter(ev => ev.kind !== KIND_CHANNEL);
      console.log(`🚫 kind:42を非表示 (${tab}タブ)`);
    }

    // 1. 禁止ワードフィルタ (global/following)
    const forbiddenWords = window.app?.forbiddenWords || [];
    if ((tab === 'global' || tab === 'following') && forbiddenWords.length > 0) {
      events = events.filter(ev => {
        if (ev.kind !== KIND_TEXT_NOTE) return true;
        const content = ev.content.toLowerCase();
        return !forbiddenWords.some(word => content.includes(word.toLowerCase()));
      });
    }

    // 2. 短い投稿の制限 (global/following)
    if (tab === 'global' || tab === 'following') {
      events = events.filter(ev => {
        if (ev.kind !== KIND_TEXT_NOTE) return true;
        return ev.content.length <= 190;
      });
    }

    // 3. flowgazerしぼりこみ (likes以外)
    if (flowgazerOnly && tab !== 'likes') {
      events = events.filter(ev =>
        ev.kind === KIND_TEXT_NOTE &&
        ev.tags.some(tag => tag[0] === 'client' && tag[1] === 'flowgazer')
      );
    }

    // 4. 投稿者しぼりこみ (globalのみ)
    if (tab === 'global' && authors?.length > 0) {
      const authorSet = new Set(authors);
      events = events.filter(ev => authorSet.has(ev.pubkey));
      console.log(`🔍 globalタブ: 投稿者絞り込み適用（${authors.length}人）`);
    }

    // 5. kind:1基準のフィルタリング (global/following)
    if (tab === 'global' || tab === 'following') {
      const kind1Events = events.filter(e => e.kind === KIND_TEXT_NOTE);
      
      if (kind1Events.length > 0) {
        const kind1Oldest = kind1Events[Math.min(149, kind1Events.length - 1)]?.created_at || 0;
        
        events = events.filter(e => {
          if (e.kind === KIND_TEXT_NOTE) return true;
          if ([KIND_REPOST, KIND_CHANNEL].includes(e.kind)) {
            return e.created_at >= kind1Oldest;
          }
          return true;
        });
      }
    }
    // 7. 最終確認: 自分関連の投稿を global/following から除外
if ((tab === 'global' || tab === 'following') && myPubkey) {
  events = events.filter(ev => {
    // 自分の投稿を除外
    if (ev.pubkey === myPubkey) {
      return false;
    }
    
    // 自分へのリプライを除外
    const mentionsMe = ev.tags.some(t => t[0] === 'p' && t[1] === myPubkey);
    if (mentionsMe) {
      return false;
    }
    
    // 自分の投稿へのリツイートを除外
    if (ev.kind === KIND_REPOST) {
      const repostedEventId = ev.tags.find(t => t[0] === 'e')?.[1];
      if (repostedEventId) {
        const originalEvent = window.dataStore.getEvent(repostedEventId);
        if (originalEvent && originalEvent.pubkey === myPubkey) {
          return false;
        }
      }
    }
    
    return true;
  });
}

return events;
  }

  // ========================================
  // LoadMoreフィルタ構築
  // ========================================

  /**
   * LoadMore用フィルタを構築
   * @param {string} tab
   * @param {number} untilTimestamp
   * @returns {Object|null} フィルタオブジェクト
   */
  buildLoadMoreFilter(tab, untilTimestamp) {
    const myPubkey = window.nostrAuth?.pubkey;

    const filter = {
      until: untilTimestamp - 1,
      limit: 50
    };

    switch (tab) {
      case 'global':
        filter.kinds = [KIND_TEXT_NOTE, KIND_REPOST];
        break;

      case 'following':
        if (window.dataStore.followingPubkeys.size === 0) {
          console.warn('フォローリストが空です');
          return null;
        }
        filter.kinds = [KIND_TEXT_NOTE, KIND_REPOST];
        const followingAuthors = Array.from(window.dataStore.followingPubkeys);
        filter.authors = myPubkey 
          ? followingAuthors.filter(pk => pk !== myPubkey)
          : followingAuthors;
        break;

      case 'myposts':
        if (!myPubkey) {
          console.warn('ログインが必要です');
          return null;
        }
        filter.kinds = [KIND_TEXT_NOTE];
        filter.authors = [myPubkey];
        break;

      case 'likes':
        if (!myPubkey) {
          console.warn('ログインが必要です');
          return null;
        }
        filter.kinds = [KIND_REACTION];
        filter['#p'] = [myPubkey];
        break;

      default:
        console.error('Unknown tab:', tab);
        return null;
    }

    return filter;
  }

  // ========================================
  // カーソル/タイムスタンプ管理
  // ========================================

  /**
   * 指定タブの最古タイムスタンプを取得
   * @param {string} tab
   * @returns {number}
   */
  getOldestTimestamp(tab) {
    const cursor = this.tabs[tab]?.cursor;
    return cursor?.until || Math.floor(Date.now() / 1000);
  }

  // ========================================
  // 描画スケジューリング
  // ========================================

  /**
   * 遅延描画をスケジュール
   */
  scheduleRender() {
    if (!window.app?.isAutoUpdate) return;

    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      if (window.timeline && typeof window.timeline.refresh === 'function') {
        window.timeline.refresh();
      }
    }, this.renderDelay);
  }

  /**
   * 即座に描画
   */
  renderNow() {
    clearTimeout(this.renderTimer);
    if (window.timeline && typeof window.timeline.refresh === 'function') {
      window.timeline.refresh();
    }
  }

  // ========================================
  // ユーティリティ
  // ========================================

  /**
   * タブをクリア
   * @param {string} tab
   */
  clearTab(tab) {
    const tabState = this.tabs[tab];
    if (tabState) {
      tabState.visibleEventIds.clear();
      tabState.cursor = null;
      console.log(`🗑️ タブ "${tab}" の状態をクリアしました。`);
    }
  }

  /**
   * すべてをクリア
   */
  clearAll() {
    Object.keys(this.tabs).forEach(tab => this.clearTab(tab));
    this.selfFeed = [];
    console.log('🗑️ ViewState全体をクリアしました');
  }
}

// グローバルインスタンス
window.viewState = new ViewState();