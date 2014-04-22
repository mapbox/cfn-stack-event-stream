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
