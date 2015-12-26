var Readable = require('stream').Readable;

module.exports = function(cfn, stackName, options) {
    options = options || {};

    var stream = new Readable({objectMode: true}),
        pollInterval = options.pollInterval || 1000,
        describing = false,
        complete = false,
        seen = {},
        events = [],
        push = stream.push.bind(stream);

    if (options.lastEventId) {
        seen[options.lastEventId] = true;
    }

    stream._read = function() {
        if (describing || complete) return;
        describeEvents();
    };

    function describeEvents(nextToken) {
        describing = true;
        cfn.describeStackEvents({StackName: stackName, NextToken: nextToken}, function(err, data) {
            describing = false;

            if (err && err.retryable) {
                stream.emit('managedError', err);
                return setTimeout(function() { describeEvents(nextToken); }, 5000);
            } else if (err) {
                return stream.emit('error', err);
            }

            for (var i = 0; i < data.StackEvents.length; i++) {
                var event = data.StackEvents[i];

                // Assuming StackEvents are in strictly reverse chronological order.
                // If we get to what we've seen already we don't need to go on to the
                // next page.
                if (seen[event.EventId])
                    break;

                events.push(event);
                seen[event.EventId] = true;
            }

            if (i === data.StackEvents.length && data.NextToken) {
                describeEvents(data.NextToken);

            } else if (complete) {
                events.reverse().forEach(push);
                push(null);

            } else {
                describeStack();
                events.reverse().forEach(push);
                events = [];
            }
        });
    }

    function describeStack() {
        describing = true;
        cfn.describeStacks({StackName: stackName}, function(err, data) {
            describing = false;

            if (err && err.retryable) {
                stream.emit('managedError', err);
                return setTimeout(function() { describeStack(); }, 5000);
            } else if (err) {
                return stream.emit('error', err);
            }

            if (/COMPLETE$/.test(data.Stacks[0].StackStatus)) {
                complete = true;
                describeEvents();
            } else {
                setTimeout(describeEvents, pollInterval);
            }
        });
    }

    return stream;
};
