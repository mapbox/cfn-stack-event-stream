var test = require('tap').test;
var assert = require('assert');
var Stream = require('./.');
var AWS = require('aws-sdk');

var cfn = new AWS.CloudFormation({region: 'us-east-1'});

test('emits an error for a non-existent stack', function (t) {
    Stream(cfn, 'cfn-stack-event-stream-test')
        .on('data', function (e) {})
        .on('error', function (err) {
            assert.ok(err);
            t.end();
        });
});

test('streams events until stack is complete', {timeout: 60000}, function (t) {
    var events = [],
        since = new Date(),
        stackName = 'cfn-stack-event-stream-test';

    cfn.createStack({
        StackName: stackName,
        TemplateBody: JSON.stringify(template)
    }, function (err) {
        assert.ifError(err);
        Stream(cfn, stackName, {since: since})
            .on('data', function (e) {
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
                    t.end();
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
