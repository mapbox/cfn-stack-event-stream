'use strict';

const Readable = require('stream').Readable;

module.exports = function(cfn, stackName, options) {
  options = options || {};

  const stream = new Readable({ objectMode: true }),
    pollInterval = options.pollInterval || 10000,
    seen = {},
    push = stream.push.bind(stream);

  let describing = false,
    complete = false,
    stackId = stackName,
    events = [];


  if (options.lastEventId) {
    seen[options.lastEventId] = true;
  }

  stream._read = function() {
    if (describing || complete) return;
    describeStack();
  };

  function describeEvents(nextToken) {
    describing = true;
    // Describe stacks using stackId (ARN) as CF stacks are actually
    // not unique by name.
    cfn.describeStackEvents({ StackName: stackId, NextToken: nextToken }, (err, data) => {
      describing = false;

      if (err) return stream.emit('error', err);

      let i;
      for (i = 0; i < (data.StackEvents || []).length; i++) {
        const event = data.StackEvents[i];

        // Assuming StackEvents are in strictly reverse chronological order,
        // stop reading events once we reach one we've seen already.
        if (seen[event.EventId])
          break;

        // Collect new events in an array and mark them as "seen".
        events.push(event);
        seen[event.EventId] = true;

        // If we reach a user initiated event assume this event is the
        // initiating event the caller intends to monitor.
        if (event.LogicalResourceId === stackName &&
          event.ResourceType === 'AWS::CloudFormation::Stack' &&
          event.ResourceStatusReason === 'User Initiated') {
          break;
        }
      }

      // If we did not find an event on this page we had already seen, paginate.
      if (i === (data.StackEvents || []).length && data.NextToken) {
        describeEvents(data.NextToken);
      }

      // We know that the update is complete, whatever we have in the events
      // array represents the last few events to stream.
      else if (complete) {
        events.reverse().forEach(push);
        push(null);

      }

      // The update is not complete, and there aren't any new events or more
      // pages to scan. DescribeStack in order to check again to see if the
      // update has completed.
      else {
        setTimeout(describeStack, pollInterval);
        events.reverse().forEach(push);
        events = [];
      }
    }).on('retry', (res) => {
      // Force a minimum 5s retry delay.
      res.error.retryDelay = Math.max(5000, res.error.retryDelay || 5000);
      stream.emit('retry', res.error);
    });
  }

  function describeStack() {
    describing = true;
    cfn.describeStacks({ StackName: stackId }, (err, data) => {
      describing = false;

      if (err) return stream.emit('error', err);
      if (!data.Stacks.length) return stream.emit('error', new Error('Could not describe stack: ' + stackName));

      stackId = data.Stacks[0].StackId;

      if (/COMPLETE$/.test(data.Stacks[0].StackStatus)) {
        complete = true;
        describeEvents();
      } else {
        setTimeout(describeEvents, pollInterval);
      }
    }).on('retry', (res) => {
      // Force a minimum 5s retry delay.
      res.error.retryDelay = Math.max(5000, res.error.retryDelay || 5000);
      stream.emit('retry', res.error);
    });
  }

  return stream;
};
