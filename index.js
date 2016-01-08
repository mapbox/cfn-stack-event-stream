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

            if (err) return stream.emit('error', err);

            for (var i = 0; i < data.StackEvents.length; i++) {
                var event = data.StackEvents[i];

                // Assuming StackEvents are in strictly reverse chronological order.
                // If we get to what we've seen already we don't need to go on to the
                // next page.
                if (seen[event.EventId])
                    break;

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
        }).on('retry', function(res) {
            // Force a minimum 5s retry delay.
            res.error.retryDelay = Math.max(5000, res.error.retryDelay||5000);
            stream.emit('retry', res.error);
        });
    }

    function describeStack() {
        describing = true;
        cfn.describeStacks({StackName: stackName}, function(err, data) {
            describing = false;

            if (err) return stream.emit('error', err);

            if (/COMPLETE$/.test(data.Stacks[0].StackStatus)) {
                complete = true;
                describeEvents();
            } else {
                setTimeout(describeEvents, pollInterval);
            }
        }).on('retry', function(res) {
            // Force a minimum 5s retry delay.
            res.error.retryDelay = Math.max(5000, res.error.retryDelay||5000);
            stream.emit('retry', res.error);
        });
    }

    return stream;
};
