// Performs an ordinary least squares regression.
function VelocityCalculator(bufferSize) {
  var y_buffer = [];
  var t_buffer = [];

  var y_sum = 0;
  var t_sum = 0;

  this.addValue = function(y, t) {
    y_buffer.push(y);
    y_sum += y;
    t_buffer.push(t);
    t_sum += t;

    if (y_buffer.length > bufferSize) {
      y_sum -= y_buffer.shift();
      t_sum -= t_buffer.shift();
    }
  }

  this.getVelocity = function() {
    if (y_buffer.length < bufferSize) {
      return 0;
    }

    var y_mean = y_sum / bufferSize;
    var t_mean = t_sum / bufferSize;

    var sum_yt = 0;
    var sum_tt = 0;

    for (var i = 0; i < bufferSize; ++i) {
      sum_yt += (y_buffer[i] - y_mean) * (t_buffer[i] - t_mean);
      sum_tt += (t_buffer[i] - t_mean) * (t_buffer[i] - t_mean);
    }

    return sum_yt / sum_tt;
  }
}

Polymer('polymer-p2r', {
  ready: function() {
    var self = this;
    var scroller = self.$.scroller;
    var p2r = self.$.p2r;
    var scrollcontent = self.$.scrollcontent;
    var framePending = false;
    var overscrollOffset = 0;
    var lastY = 0;
    var startY = 0;
    var pulling = false;
    var loading = false;
    var loadingOffset = 125;
    var seenTouchMoveThisSequence = false;
    var fingersDown = 0;
    var inFlingAnimation = false;
    var velocityCalculator = new VelocityCalculator(5);

    /*
    TODO - see if there is a good way to avoid hardcoding this in the css.
    scrollcontent.style.top="-100px";
    scrollcontent.style.marginBottom="-100px";
    */

    function getHeaderClassName(name) {
      return self.className;
    }

    function setHeaderClassName(name) {
      self.className = name;
    }

    function translateY(element, offset) {
      element.style.webkitTransform = 'translate3d(0, ' + offset + 'px, 0)';
    }

    function checkPulled() {
      var triggerOffset = 60;
      if (getHeaderClassName() != 'loading') {
        setHeaderClassName(overscrollOffset > triggerOffset ? 'pulled' : '');
      }
    }

    function onAnimationFrame() {
      framePending = false;
      checkPulled();
      translateY(scrollcontent, overscrollOffset);
      translateY(p2r, overscrollOffset - p2r.clientHeight);
    }

    function scheduleUpdate() {
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(onAnimationFrame);
      }
    }

    function addFriction(delta) {
      var scale = 2;
      var maxDelta = 200;
      delta /= scale;
      if (delta > maxDelta)
      delta = maxDelta;

      // We want a curve that starts out linear, and slopes down
      // to slope=0 by maxDelta.
      var adj = delta - delta*delta/(2*maxDelta);
      return adj;
    }

    function setAnimationEnabled(enabled) {
      var val = enabled ? '-webkit-transform 0.2s ease-in-out' : '';
      scrollcontent.style.webkitTransition = val;
      p2r.style.webkitTransition = val;
    }

    function setOffset(offset) {
      if (loading) {
        offset += loadingOffset;
      }
      overscrollOffset = addFriction(offset);
      scheduleUpdate();
    }

    function isP2rVisible() {
      return scroller.scrollTop <= addFriction(loadingOffset);
    }

    function finishPull() {
      if (!pulling) {
        setOffset(0);
      }
    }

    function finishLoading() {
      loading = false;
      if (pulling) {
        setHeaderClassName('');
        startY -= loadingOffset;
        checkPulled();
      } else if (isP2rVisible()) {
        setAnimationEnabled(true);
        overscrollOffset = scroller.scrollTop;
        scheduleUpdate();
      }
    }

    scroller.addEventListener('touchstart', function(e) {
      inFlingAnimation = false;
      fingersDown++;
      seenTouchMoveThisSequence = false;
      if (e.touches.length == 1) {
        lastY = e.touches[0].clientY;
        setAnimationEnabled(false);
        if (!loading) {
          scroller.scrollTop -= overscrollOffset;
          overscrollOffset = 0;
          scheduleUpdate();
          setHeaderClassName('');
        }
      }
    });

    scroller.addEventListener('touchmove', function(e) {
      if (!pulling &&
          scroller.scrollTop === 0 &&
          e.touches.length == 1 &&
          e.touches[0].clientY > lastY) {
        startY = e.touches[0].clientY;
        pulling = true;
      }

      if (pulling) {
        var offset = e.touches[0].clientY - startY;
        if (offset >= 0) {
          setOffset(offset);
          // Don't preventDefault the first touchMove, it would prevent
          // scroll from occurring.
          if (seenTouchMoveThisSequence) {
            e.preventDefault();
          }
        } else {
          pulling = false;
          finishPull();
        }
      }
      seenTouchMoveThisSequence = true;
      lastY = e.touches[0].clientY;
    });

    scroller.addEventListener('touchcancel', function(e) {
      fingersDown--;
      finishPull();
    });
    scroller.addEventListener('touchend', function(e) {
      fingersDown--;
      setAnimationEnabled(true);
      pulling = false;
      if (getHeaderClassName() == 'pulled') {
        setHeaderClassName('loading');
        loading = true;
        setOffset(0);
        setTimeout(finishLoading, 2000);
      } else {
        finishPull();
      }
    });

    var frame = 0;
    var flingAnimationTimeSeconds = 0.2;

    function secondEnd() {
      scrollcontent.removeEventListener('webkitTransitionEnd', secondEnd);
      scrollcontent.style['-webkit-animation'] = '';
      scroller.addEventListener('scroll', onScrollEvent);
    }

    function firstEnd() {
      var val = '-webkit-transform ' + flingAnimationTimeSeconds + 's ease-in';
      scrollcontent.style.webkitTransition = val;
      p2r.style.webkitTransition = val;

      translateY(scrollcontent, overscrollOffset);
      translateY(p2r, overscrollOffset - p2r.clientHeight);

      scrollcontent.removeEventListener('webkitTransitionEnd', firstEnd);
      scrollcontent.addEventListener('webkitTransitionEnd', secondEnd);
    }

    function onScrollEvent(e) {
      frame++;
      velocityCalculator.addValue(scroller.scrollTop, window.performance.now());

      var vel = velocityCalculator.getVelocity();
      vel = Math.max(-2.5, vel);

      // The higher the velocity, the longer the animation should be. We solve
      // for the duration of the animation based on the kinematic equations,
      // using a made up acceleration that feels about right. Note that since
      // the animation path isn't a parabola, this isn't quite correct.
      var acceleration = 10;
      var duration = (-vel + Math.sqrt(vel*vel)) / acceleration;
      var distance = -vel * (duration/2.0) +
          0.5 * acceleration * (duration/2.0) * (duration/2.0);
      distance *= 100;

      if (distance < 10 || scroller.scrollTop > 10) {
        return;
      }

      if (fingersDown == 0 && !inFlingAnimation) {
        inFlingAnimation = true;
        var val = '-webkit-transform ' + duration + 's ease-out';
        scrollcontent.style.webkitTransition = val;
        p2r.style.webkitTransition = val;

        scroller.removeEventListener('scroll', onScrollEvent);
        scrollcontent.addEventListener('webkitTransitionEnd', firstEnd);
        translateY(scrollcontent, distance);
        translateY(p2r, distance - p2r.clientHeight);
      }
    }

    scroller.addEventListener('scroll', onScrollEvent);
  }
});
