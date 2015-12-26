var test = require('tape');
var Stream = require('../.');
var AWS = require('aws-sdk');

var cfn = new AWS.CloudFormation({region: 'us-east-1'});

test('handles throttle events', {timeout: 60000}, function (assert) {
    var events = [],
        managed = [],
        stackName = 'cfn-stack-event-stream-test-throttle';

    cfn.createStack({
        StackName: stackName,
        TemplateBody: JSON.stringify(template)
    }, function (err) {
        assert.ifError(err);

        // Hammer CF API to trigger throttling.
        var interval = setInterval(function() {
            cfn.describeStacks({StackName: stackName}, function(err, data) {});
        }, 100);

        Stream(cfn, stackName)
            .on('managedError', function(err) {
                assert.ok(err, 'managedError');
                managed.push(err);
                clearInterval(interval);
            })
            .on('data', function (e) {
                assert.ok(e, 'data');
                events.push(e);
            })
            .on('end', function () {
                cfn.deleteStack({StackName: stackName}, function(err) {
                    assert.ifError(err);
                    assert.deepEqual(events.map(function (e) { return e.ResourceStatus; }), [
                        'CREATE_IN_PROGRESS',
                        'CREATE_FAILED',
                        'ROLLBACK_IN_PROGRESS',
                        'DELETE_COMPLETE',
                        'ROLLBACK_COMPLETE'
                    ]);
                    assert.equal(managed.length > 0, true);
                    assert.end();
                });
            });
    });
});

var template = {
    "AWSTemplateFormatVersion": "2010-09-09",
    "Description": "cfn-stack-event-stream-test",
    "Resources": {
        "Test": {
            "Type": "AWS::AutoScaling::LaunchConfiguration",
            "Properties": {

            }
        }
    }
};
