'use strict';

const test = require('tape');
const Stream = require('../.');
const AWS = require('aws-sdk');

const cfn = new AWS.CloudFormation({ region: 'us-east-1' });

const template = {
  'AWSTemplateFormatVersion': '2010-09-09',
  'Description': 'cfn-stack-event-stream-test',
  'Resources': {
    'Test': {
      'Type': 'AWS::AutoScaling::LaunchConfiguration',
      'Properties': {

      }
    }
  }
};


test('handles throttle events', { timeout: 60000 }, (assert) => {
  const events = [],
    managed = [],
    stackName = 'cfn-stack-event-stream-test-throttle';

  cfn.createStack({
    StackName: stackName,
    TemplateBody: JSON.stringify(template)
  }, (err) => {
    assert.ifError(err);

    // Hammer CF API to trigger throttling.
    const interval = setInterval(() => {
      cfn.describeStacks({ StackName: stackName }, () => {});
    }, 100);

    Stream(cfn, stackName)
      .on('retry', (err) => {
        assert.ok(err, 'retry');
        managed.push(err);
        clearInterval(interval);
      })
      .on('data', (e) => {
        assert.ok(e, 'data');
        events.push(e);
      })
      .on('end', () => {
        cfn.deleteStack({ StackName: stackName }, (err) => {
          assert.ifError(err);
          assert.deepEqual(events.map((e) => { return e.ResourceStatus; }), [
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
