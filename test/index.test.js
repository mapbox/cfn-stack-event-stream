var test = require('tape');
var Stream = require('../.');
var AWS = require('aws-sdk');

var cfn = new AWS.CloudFormation({region: 'us-east-1'});

test('emits an error for a non-existent stack', function (assert) {
    Stream(cfn, 'cfn-stack-event-stream-test')
        .on('data', function (e) {})
        .on('error', function (err) {
            assert.ok(err);
            assert.end();
        });
});

test('streams events until stack is complete', {timeout: 120000}, function (assert) {
    var stackName = 'cfn-stack-event-stream-test-create';

    cfn.createStack({
        StackName: stackName,
        TemplateBody: JSON.stringify(template)
    }, function (err) {
        if (err) {
            assert.ifError(err);
            assert.end();
            return;
        }
        var events = [
            'CREATE_IN_PROGRESS AWS::CloudFormation::Stack',
            'CREATE_IN_PROGRESS AWS::SNS::Topic',
            'CREATE_IN_PROGRESS AWS::SNS::Topic',
            'CREATE_COMPLETE AWS::SNS::Topic',
            'CREATE_COMPLETE AWS::CloudFormation::Stack'
        ];
        Stream(cfn, stackName)
            .on('data', function (e) {
                assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
                events.shift();
            })
            .on('end', function () {
                updateStack();
            });
    });

    function updateStack() {
        // Modify template for update.
        var templateUpdated = JSON.parse(JSON.stringify(template));
        templateUpdated.Resources.NewTopic = {
            "Type": "AWS::SNS::Topic",
            "Properties" : {
                "DisplayName": "Topic2"
            }
        };

        cfn.updateStack({
            StackName: stackName,
            TemplateBody: JSON.stringify(templateUpdated)
        }, function (err) {
            if (err) {
                assert.ifError(err);
                assert.end();
                return;
            }
            var events = [
                'UPDATE_IN_PROGRESS AWS::CloudFormation::Stack',
                'CREATE_IN_PROGRESS AWS::SNS::Topic',
                'CREATE_IN_PROGRESS AWS::SNS::Topic',
                'CREATE_COMPLETE AWS::SNS::Topic',
                'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS AWS::CloudFormation::Stack',
                'UPDATE_COMPLETE AWS::CloudFormation::Stack'
            ];
            Stream(cfn, stackName)
                .on('data', function (e) {
                    assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
                    events.shift();
                })
                .on('end', function () {
                    deleteStack();
                });
        });
    }

    function deleteStack() {
        cfn.deleteStack({StackName: stackName}, function(err) {
            assert.ifError(err);
            assert.end();
        });
    }
});

test('streams events during stack deletion', {timeout: 60000}, function (assert) {
    var stackName = 'cfn-stack-event-stream-test-delete',
        lastEventId;

    cfn.createStack({
        StackName: stackName,
        TemplateBody: JSON.stringify(template)
    }, function (err, stack) {
        if (err) {
            assert.ifError(err);
            assert.end();
            return;
        }
        Stream(cfn, stackName)
            .on('data', function (e) {
                lastEventId = e.EventId;
            })
            .on('end', function () {
                cfn.deleteStack({StackName: stackName}, function(err) {
                    if (err) {
                        assert.ifError(err);
                        assert.end();
                        return;
                    }
                    var events = [
                        'DELETE_IN_PROGRESS AWS::CloudFormation::Stack',
                        'DELETE_IN_PROGRESS AWS::SNS::Topic',
                        'DELETE_COMPLETE AWS::SNS::Topic',
                        'DELETE_COMPLETE AWS::CloudFormation::Stack'
                    ];
                    Stream(cfn, stack.StackId, {lastEventId: lastEventId})
                        .on('data', function (e) {
                            assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
                            events.shift();
                        })
                        .on('end', function () {
                            assert.end();
                        });
                });
            });
    });
});

var template = {
    "AWSTemplateFormatVersion": "2010-09-09",
    "Description": "cfn-stack-event-stream-test",
    "Parameters": {
        "TestParameter": {
            "Description": "A parameter for testing",
            "Type": "String",
            "Default": "TestParameterValue"
        }
    },
    "Resources": {
        "TestTopic" : {
            "Type": "AWS::SNS::Topic",
            "Properties" : {
                "DisplayName": { "Ref": "TestParameter" }
            }
        }
    }
};

