A readable stream of CloudFormation stack events.

## Usage

```js
var AWS = require('aws-sdk');
var EventStream = require('cfn-stack-event-stream');

var cfn = new AWS.CloudFormation({region: 'us-east-1'});

cfn.createStack({
    StackName: 'my-stack',
    TemplateBody: template
}, function(err) {
    if (err) throw err;
    EventStream(cfn, 'my-stack')
        .on('data', function (e) {
            console.log(e.ResourceStatus, e.ResourceType, e.ResourceStatusReason);
        })
        .on('end', function() {
            cfn.describeStacks({StackName: 'my-stack'}, function(err, data) {
                if (err) throw err;
                console.log('Result: ' + data.Stacks[0].StackStatus);
            });
        });
});
```

## API

### `EventStream(cfn, stackName, options)`

Returns an object-mode [readable stream](http://nodejs.org/api/stream.html#stream_class_stream_readable)
which emits `StackEvent` objects as returned by [`describeStackEvents`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudFormation.html#describeStackEvents-property)

Required parameters:

* `cfn`: An [`AWS::CloudFormation`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudFormation.html) instance.
* `stackName`: The name of the stack.

Options:

* `lastEventId`: The `EventId` of a `StackEvent`. StackEvents emitted by the resulting stream
   are guaranteed not to include this event or any preceding events.
