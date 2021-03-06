/*global browser DefaultValues TopMenu StatusBar feedStatus BrowserManager Feed Listener ListenerProviders FeedParser ItemsPanel*/
'use strict';
class FeedManager { /*exported FeedManager*/
  static get instance() {
    if (!this._instance) {
      this._instance = new FeedManager();
    }
    return this._instance;
  }

  constructor() {
    this._updatedFeeds = 0;
    this._asynchronousFeedChecking = DefaultValues.asynchronousFeedChecking;
    this._showFeedUpdatePopup = DefaultValues.showFeedUpdatePopup;
    this._renderFeed = DefaultValues.renderFeeds;
    this._feedProcessingInProgress = false;
    this._feedsToProcessList = [];
    this._feedsToProcessCounter = 0;
    this._unifiedChannelTitle = '';
    this._unifiedFeedItems = [];
    this._itemList = [];
    Listener.instance.subscribe(ListenerProviders.localStorage, 'asynchronousFeedChecking', FeedManager._setAsynchronousFeedChecking_sbscrb, true);
    Listener.instance.subscribe(ListenerProviders.localStorage, 'showFeedUpdatePopup', FeedManager._setShowFeedUpdatePopup, true);
    Listener.instance.subscribe(ListenerProviders.localStorage, 'renderFeeds', FeedManager._setRenderFeeds_sbscrb, true);
  }

  async delete(feedId) {
    await Feed.delete_async(feedId);
  }

  async checkFeeds_async(folderId) {
    if (this._feedProcessingInProgress) { return; }
    TopMenu.instance.animateCheckFeedButton(true);
    await this._preparingListOfFeedsToProcess_async(folderId, '.feedRead, .feedError', browser.i18n.getMessage('sbChecking'));
    await this._processFeedsFromList(folderId, this._feedsUpdate_async);
  }

  async openOneFeedToTabById_async(feedId, openNewTabForce, openNewTabBackGroundForce) {
    let feed = await Feed.new(feedId);
    this._itemList = [];
    let isSingle=true; let displayItems=true; let folderTitle=null;
    this._openOneFeedToTab_async(feed, isSingle, openNewTabForce, displayItems, folderTitle, openNewTabBackGroundForce);
  }

  async openAllUpdatedFeeds_async(folderId) {
    if (this._feedProcessingInProgress) { return; }
    await this._preparingListOfFeedsToProcess_async(folderId, '.feedUnread', browser.i18n.getMessage('sbOpening'));
    await this._processFeedsFromList(folderId, this._openOneFeedToTab_async);
  }

  async openAsUnifiedFeed_async(folderId) {
    if (this._feedProcessingInProgress) { return; }
    await this._preparingListOfFeedsToProcess_async(folderId, '.feedUnread', browser.i18n.getMessage('sbOpening'));
    this._unifiedChannelTitle = (await browser.bookmarks.getSubTree(folderId.substring(3)))[0].title;
    await this._processFeedsFromList(folderId, this._unifyingThenOpenProcessedFeedsInner_async);
  }


  async updateFeedTitle_async(feedId) {
    let feed = await Feed.new(feedId);
    await feed.updateTitle_async();
    feed.updateUiTitle();
  }

  async _preparingListOfFeedsToProcess_async(folderId, querySelector, action) {
    this._feedProcessingInProgress = true;
    try {
      this._updatedFeeds = 0;
      StatusBar.instance.workInProgress = true;
      this._feedsToProcessList = [];
      this._itemList = [];
      let rootElement = document.getElementById(folderId);
      let feedElementList = rootElement.querySelectorAll(querySelector);
      if (feedElementList.length > 0) {
        for (let i = 0; i < feedElementList.length; i++) {
          let feed = null;
          try {
            let feedId = feedElementList[i].getAttribute('id');
            feed = await Feed.new(feedId);

            StatusBar.instance.text = (this._asynchronousFeedChecking ? action : browser.i18n.getMessage('sbPreparing')) + ': ' + feed.title;
            this._feedsToProcessList.push(feed);
          }
          catch(e) {
            /*eslint-disable no-console*/
            console.log(e);
            /*eslint-enable no-console*/
          }
        }
      }
      else {
        this._processFeedsFinished();
      }
    }
    finally {
    }
  }

  async _processFeedsFromList(folderId, action) {
    let folderTitle = '';
    this._feedsToProcessCounter = this._feedsToProcessList.length;
    let openNewTabForce = true;
    let elFolderLabel = document.getElementById('lbl-' + folderId.substring(3));
    if (elFolderLabel) { folderTitle = elFolderLabel.textContent; }
    if (this._asynchronousFeedChecking) {
      while (this._feedsToProcessList.length > 0) {
        let feed = this._feedsToProcessList.shift();
        let isLast = (this._feedsToProcessList.length == 0);
        action(feed, false, openNewTabForce, isLast, folderTitle);
      }
    } else {
      while (this._feedsToProcessList.length > 0) {
        let feed = this._feedsToProcessList.shift();
        let isLast = (this._feedsToProcessList.length == 0);
        await action(feed, false, openNewTabForce, isLast, folderTitle);
      }
    }
  }

  _processFeedsFinished() {
    StatusBar.instance.text = '';
    TopMenu.instance.animateCheckFeedButton(false);
    StatusBar.instance.workInProgress = false;
    this._feedProcessingInProgress = false;
  }

  async _feedsUpdate_async(feed) {
    let self = FeedManager.instance;
    try {
      self._statusMessageBeforeCheck(feed);
      await feed.update_async();
      self._statusMessageAfterCheck(feed);
      await feed.updateUiStatus_async();
      feed.updateUiStatus_async();
      if (feed.status == feedStatus.UPDATED) {
        self._updatedFeeds++;
      }
    } catch(e) {
      await feed.setStatus_async(feedStatus.ERROR);
      feed.updateUiStatus_async();
      /*eslint-disable no-console*/
      console.log(e);
      /*eslint-enable no-console*/
    } finally {
      if (--self._feedsToProcessCounter == 0) {
        self._displayUpdatedFeedsNotification();
        self._processFeedsFinished();
      }
    }
  }

  async _openOneFeedToTab_async(feed, isSingle, openNewTabForce, displayItems, folderTitle, openNewTabBackGroundForce) {
    let self = FeedManager.instance;
    try {
      StatusBar.instance.text = browser.i18n.getMessage('sbLoading') + ' ' + feed.title;
      await feed.update_async();
      let feedHtmlUrl = feed.docUrl;
      self._itemList.push(... feed.info.itemList);
      let isUnified = false;
      await self._displayItems_async(displayItems, isSingle, isUnified, feed, folderTitle);
      StatusBar.instance.text = browser.i18n.getMessage('sbLoading') + ' ' + feed.title;
      await self._openTabFeed_async(feedHtmlUrl, openNewTabForce, openNewTabBackGroundForce);
      StatusBar.instance.text = browser.i18n.getMessage('sbLoading') + ' ' + feed.title;
      await feed.setStatus_async(feedStatus.OLD);
      StatusBar.instance.text = browser.i18n.getMessage('sbLoading') + ' ' + feed.title;
      feed.updateUiStatus_async();
      StatusBar.instance.text = feed.title + ' ' + browser.i18n.getMessage('sbLoaded') + ' ';

    } catch(e) {
      await feed.setStatus_async(feedStatus.ERROR);
      feed.updateUiStatus_async();
      /*eslint-disable no-console*/
      console.log(e);
      /*eslint-enable no-console*/

    } finally {
      if (--self._feedsToProcessCounter <= 0) {
        self._processFeedsFinished();
      }
    }
  }

  async _unifyingThenOpenProcessedFeedsInner_async(feed, isSingle, openNewTabForce, displayItems, folderTitle) {
    let self = FeedManager.instance;
    try {
      StatusBar.instance.text = browser.i18n.getMessage('sbMerging') + ' ' + feed.title;
      await feed.update_async();
      self._unifiedFeedItems.push(...feed.info.itemList);
      await feed.setStatus_async(feedStatus.OLD);
      feed.updateUiStatus_async();
      StatusBar.instance.text = browser.i18n.getMessage('sbComputingUnifiedView');
    } catch(e) {
      await feed.setStatus_async(feedStatus.ERROR);
      feed.updateUiStatus_async();
      /*eslint-disable no-console*/
      console.log(e);
      /*eslint-enable no-console*/
    } finally {
      if (--self._feedsToProcessCounter == 0) {
        let unifiedDocUrl = self._getUnifiedDocUrl();
        let openNewTabForce = false;
        let isUnified=true; let feedNull = null;
        await self._displayItems_async(displayItems, isSingle, isUnified, feedNull, folderTitle);
        await self._openTabFeed_async(unifiedDocUrl, openNewTabForce);
        self._unifiedChannelTitle = '';
        self._processFeedsFinished();
      }
    }
  }

  async _displayItems_async(displayItems, isSingle, isUnified, feed, folderTitle) {
    if (displayItems) {
      let title =  isUnified ? folderTitle : isSingle ? feed.title : folderTitle;
      let titleLink = isSingle ? feed.info.channel.link : 'about:blank';
      let itemList = isUnified ? this._unifiedFeedItems : this._itemList;
      await ItemsPanel.instance.displayItems_async(title, titleLink, itemList);
    }
  }

  async _openTabFeed_async(feedHtmlUrl, openNewTabForce, openNewTabBackGroundForce) {
    if (this._renderFeed) {
      await BrowserManager.instance.openTab_async(feedHtmlUrl, openNewTabForce, openNewTabBackGroundForce);
    }
  }

  _statusMessageBeforeCheck(feed) {
    if (!this._asynchronousFeedChecking) {
      StatusBar.instance.text = browser.i18n.getMessage('sbChecking') + ': ' + feed.title;
    }
  }

  _statusMessageAfterCheck(feed) {
    if (feed.status == feedStatus.ERROR) {
      StatusBar.instance.text = feed.title + ' : ' + feed.error;
    } else {
      if (this._asynchronousFeedChecking) {
        StatusBar.instance.text = feed.title + ' : ' + browser.i18n.getMessage('sbReceived');
      }
    }
  }

  _getUnifiedDocUrl() {
    let unifiedFeedHtml = FeedParser.feedItemsListToUnifiedHtml(this._unifiedFeedItems, this._unifiedChannelTitle);
    let unifiedFeedBlob = new Blob([unifiedFeedHtml]);
    let unifiedFeedHtmlUrl = URL.createObjectURL(unifiedFeedBlob);
    return unifiedFeedHtmlUrl;

  }

  async markAllFeedsAsRead_async(folderId) {
    let feedElementList = document.getElementById(folderId).querySelectorAll('.feedUnread, .feedError');
    for (let i = 0; i < feedElementList.length; i++) {
      let feedElement = feedElementList[i];
      this.markFeedAsRead_async(feedElement);
    }
  }

  async markFeedAsRead_async(feedElement) {
    let feedId = feedElement.getAttribute('id');
    feedElement.classList.remove('feedError');
    feedElement.classList.remove('feedUnread');
    feedElement.classList.add('feedRead');
    let feed = await Feed.new(feedId);
    await feed.setStatus_async(feedStatus.OLD);
  }

  async markFeedAsReadById_async(feedId) {
    let feedElement= document.getElementById(feedId);
    feedElement.classList.remove('feedError');
    feedElement.classList.remove('feedUnread');
    feedElement.classList.add('feedRead');
    let feed = await Feed.new(feedId);
    await feed.setStatus_async(feedStatus.OLD);
  }


  async markAllFeedsAsUpdated_async(folderId) {
    let feedElementList = document.getElementById(folderId).querySelectorAll('.feedRead, .feedError');
    for (let i = 0; i < feedElementList.length; i++) {
      let feedElement = feedElementList[i];
      this.markFeedAsUpdated_async(feedElement);
    }
  }

  static _setAsynchronousFeedChecking_sbscrb(value){
    FeedManager.instance._asynchronousFeedChecking = value;
  }

  static _setShowFeedUpdatePopup(value) {
    FeedManager.instance._showFeedUpdatePopup = value;
  }

  async markFeedAsUpdated_async(feedElement) {
    let feedId = feedElement.getAttribute('id');
    feedElement.classList.remove('feedError');
    feedElement.classList.remove('feedUnread');
    feedElement.classList.add('feedRead');
    let feed = await Feed.new(feedId);
    feed.setStatus_async(feedStatus.UPDATED);
  }

  async markFeedAsUpdatedById_async(feedId) {
    let feedElement= document.getElementById(feedId);
    feedElement.classList.remove('feedError');
    feedElement.classList.remove('feedUnread');
    feedElement.classList.add('feedRead');
    let feed = await Feed.new(feedId);
    feed.setStatus_async(feedStatus.UPDATED);
  }


  _displayUpdatedFeedsNotification() {
    if (this._showFeedUpdatePopup) {
      if (this._updatedFeeds > 1) {
        BrowserManager.displayNotification(this._updatedFeeds + ' '+ browser.i18n.getMessage('sbFeedsUpdated'));

      }
      if (this._updatedFeeds == 1) {
        BrowserManager.displayNotification(browser.i18n.getMessage('sbOneFeedUpdated'));
      }
      if (this._updatedFeeds == 0) {
        BrowserManager.displayNotification(browser.i18n.getMessage('sbNoFeedHasBeenUpdated'));
      }
    }

    this._updatedFeeds = 0;
  }

  static _setRenderFeeds_sbscrb(value){
    FeedManager.instance._renderFeed = value;
  }

}