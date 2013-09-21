/*global QUnit, module, Ember, asyncTest, ok, equal, deepEqual, start, stop, Lawnchair*/

(function() {
  'use strict';
  QUnit.config.testTimeout = 1500;

  // Don't let RSVP eat all our errors!
  Ember.RSVP.configure('onerror', function(e) {
    throw e;
  });

  var PostModel;

  var post1Json = {id:1, title: 'Hello world'};
  var post2Json = {id:2, title:'Goodbye cruel world'};
  var post3Json = {id:3, title:'Wait a minute - it\'s little Mo!'};

  var createAndSave = function(klass, data) {
    return function() {
      return klass.create(data).save();
    };
  };

  var clearCache = function(klass) {
    return function(m) {
      klass.clearCache();
      // For some reason this need to be split over three lines??
      var promise = Ember.Deferred.create();
      promise.resolve(m);
      return promise;
    }
  };

  module('Ember.LawnchairAdapter', {
    setup: function() {
      stop();
      PostModel = Ember.Model.extend({
        id: Ember.attr(),
        title: Ember.attr()
      });
      PostModel.adapter = Ember.LawnchairAdapter.create();
      PostModel.url = 'posts';

      // Empty the IndexedDB:
      new Lawnchair({name: PostModel.adapter.prefix + PostModel.url, adapter: PostModel.adapter.lawnchairAdapter}, function(store) {
        store.nuke(function() {
          start();
        });
      });
    },
    teardown: function() {
      PostModel = null;
    }
  });

  asyncTest('when a record is created with no ID an ID should be automatically set', function() {
    PostModel.create({title: 'Hello world'}).save()
      .then(function(post) {
        ok(post.get('id'), 'ID is set');
        start();
      });
  });

  asyncTest('when a record is created with an ID that ID should be preserved', function() {
    PostModel.create(post1Json).save()
      .then(function(post) {
        ok(post.get('id'), 'ID is set');
        ok(post.get('id') === post1Json.id, 'ID has same value as originally set.');
        start();
      });
  });

  asyncTest('when a record is created we should be able to find it by its id', function() {
    PostModel.create(post1Json).save()
      .then(function(savedPost) {

        var loadedPost = PostModel.find(post1Json.id);
        Ember.loadPromise(loadedPost).then(function() {
          ok(loadedPost, 'a post is found');
          ok(loadedPost === savedPost, 'the loaded post is the same as the saved post');
          start();
        });
      });
  });

  asyncTest('when a record is created then deleted from the cache we should be still able to find it by its id', function() {
    PostModel.create(post1Json).save()
      // Clear the cache so that ember-model is forced to load our object from the adapter.
      .then(clearCache(PostModel))
      .then(function(savedPost) {
        var loadedPost = PostModel.find(post1Json.id);
        return Ember.loadPromise(loadedPost).then(function() {
          ok(loadedPost, 'a post is found');
          deepEqual(loadedPost.toJSON(), savedPost.toJSON(), 'the loaded post is the same as the saved post');
          start();
        });
      });
  });

  asyncTest('when a record is deleted it should be marked as deleted', function() {
    PostModel.create(post1Json).save()
      .then(function(savedPost) {
        savedPost.deleteRecord().then(function() {
          var loadedPost = PostModel.find(post1Json.id);
          ok(loadedPost.isDeleted, 'The model isDeleted');
          start();
        });
      });
  });

  // The behaviour here is not what I would expect but seems to mirror other ember-model adapters
  // see https://github.com/ebryn/ember-model/issues/248
  asyncTest('when a record is deleted and cache is emptied nothing should be found', function() {
    PostModel.create(post1Json).save()
      .then(function(savedPost) {
        return savedPost.deleteRecord()
          .then(clearCache(PostModel))
          .then(function() {
            var loadedPost = PostModel.find(post1Json.id);
            return Ember.loadPromise(loadedPost).then(
              function() {
                // An empty record comes back which isn't what I would expect but the only thing I can think to test against
                // is that the title comes back empty
                ok(!loadedPost.get('title'), 'no title for the returned post');
                start();
              }
            );
          });
      });
  });

  asyncTest('when two records are created findAll should return both records', function() {
    PostModel.create(post1Json).save()
      .then(createAndSave(PostModel, post2Json))
      .then(function() {
        var records = PostModel.find();
        Ember.loadPromise(records).then(function(records) {
          equal(records.get('content').length, 2, 'There are two records');
          start();
        });
      });
  });

  asyncTest('when two records are created and one has been removed from cache findAll should return both records', function() {
    PostModel.create(post1Json).save()
      .then(clearCache(PostModel))
      .then(createAndSave(PostModel, post2Json))
      .then(function() {
        var records = PostModel.find();
        Ember.loadPromise(records).then(function(records) {
          equal(records.get('length'), 2, 'There are two records');
          start();
        });
      });
  });

  asyncTest('when three records are created we should be able to find two of them with findMany', function() {
    PostModel.create(post1Json).save()
      .then(createAndSave(PostModel, post2Json))
      .then(createAndSave(PostModel, post3Json))
      .then(function() {
        var records = PostModel.find([2,3]);
        Ember.loadPromise(records).then(function(records) {
          equal(records.get('length'), 2, 'Two records are found');
          equal(records.get('firstObject.id'), 2, 'The first item has an ID of 1');
          equal(records.get('lastObject.id'), 3, 'The lastitem has an ID of 3');
          start();
        });
      });
  });

  asyncTest('when three records are created then the cache is cleared we should still be able to find two of them with findMany', function() {
    PostModel.create(post1Json).save()
      .then(createAndSave(PostModel, post2Json))
      .then(createAndSave(PostModel, post3Json))
      .then(clearCache(PostModel))
      .then(function() {
        var records = PostModel.find([3,1]);
        return Ember.loadPromise(records).then(function(records) {
          equal(records.get('length'), 2, 'Two records are found');
          equal(records.get('firstObject.id'), 3, 'The first item has an ID of 3');
          equal(records.get('lastObject.id'), 1, 'The last item has an ID of 1');
          start();
        });
      });
  });

  asyncTest('when a record is created, saved and then edited and saved the adapter should save the new record', function() {
    PostModel.create(post1Json).save()
      .then(function(model) {
         model.set('title', 'Bonjour monde!').save().then(function() {
           Ember.loadPromise(PostModel.find(1)).then(function(loadedPost) {
             equal(loadedPost.get('title'), 'Bonjour monde!', 'The loaded model has the correct title');
             start();
           });
         });
      });
  });

  // TODO: Test Model.find(<Object>), Model.fetch(), Model.fetch(id), Model.fetch(<Object>), Model.load([]), Relationships

})();
