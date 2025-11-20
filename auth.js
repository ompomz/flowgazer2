// auth.js - 新規作成
class NostrAuth {
  constructor() {
    this.pubkey = null;
    this.nsec = null;
    this.useNIP07 = false;
  }

  // NIP-07でログイン
  async loginWithExtension() {
    if (!window.nostr) {
      throw new Error('NIP-07拡張機能が見つかりません');
    }
    this.pubkey = await window.nostr.getPublicKey();
    this.useNIP07 = true;
    this.save();
    return this.pubkey;
  }

  // nsecでログイン
  loginWithNsec(nsec) {
    const decoded = NostrTools.nip19.decode(nsec);
    if (decoded.type !== 'nsec') {
      throw new Error('無効なnsecです');
    }
    this.nsec = nsec;
    this.pubkey = NostrTools.getPublicKey(decoded.data);
    this.useNIP07 = false;
    this.save();
    return this.pubkey;
  }

  // ログアウト
  logout() {
    this.pubkey = null;
    this.nsec = null;
    this.useNIP07 = false;
    localStorage.removeItem('nostr_auth');
  }

  // 状態を保存
  save() {
    localStorage.setItem('nostr_auth', JSON.stringify({
      pubkey: this.pubkey,
      nsec: this.nsec,
      useNIP07: this.useNIP07
    }));
  }

  // 状態を復元
  load() {
    const saved = localStorage.getItem('nostr_auth');
    if (saved) {
      const data = JSON.parse(saved);
      this.pubkey = data.pubkey;
      this.nsec = data.nsec;
      this.useNIP07 = data.useNIP07;
    }
  }

  // イベントに署名
  async signEvent(event) {
    if (this.useNIP07) {
      return await window.nostr.signEvent(event);
    } else if (this.nsec) {
      const decoded = NostrTools.nip19.decode(this.nsec);
      return NostrTools.finalizeEvent(event, decoded.data);
    }
    throw new Error('ログインしていません');
  }

  // ログイン状態確認
  isLoggedIn() {
    return this.pubkey !== null;
  }
}

// グローバルインスタンス
window.nostrAuth = new NostrAuth();
window.nostrAuth.load();
