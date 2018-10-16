'use strict';

const test = require('tape');
const Stream = require('../.');
const AWS = require('aws-sdk');

const cfn = new AWS.CloudFormation({ region: 'us-east-1' });

const template = {
  'AWSTemplateFormatVersion': '2010-09-09',
  'Description': 'cfn-stack-event-stream-test',
  'Parameters': {
    'TestParameter': {
      'Description': 'A parameter for testing',
      'Type': 'String',
      'Default': 'TestParameterValue'
    }
  },
  'Resources': {
    'TestTopic': {
      'Type': 'AWS::SNS::Topic',
      'Properties': {
        'DisplayName': { 'Ref': 'TestParameter' }
      }
    }
  }
};

test('emits an error for a non-existent stack', (assert) => {
  Stream(cfn, 'cfn-stack-event-stream-test')
    .on('data', () => {})
    .on('error', (err) => {
      assert.ok(err);
      assert.end();
    });
});

test('streams events until stack is complete', { timeout: 120000 }, (assert) => {
  const stackName = 'cfn-stack-event-stream-test-create';

  cfn.createStack({
    StackName: stackName,
    TemplateBody: JSON.stringify(template)
  }, (err) => {
    if (err) {
      assert.ifError(err);
      assert.end();
      return;
    }
    const events = [
      'CREATE_IN_PROGRESS AWS::CloudFormation::Stack',
      'CREATE_IN_PROGRESS AWS::SNS::Topic',
      'CREATE_IN_PROGRESS AWS::SNS::Topic',
      'CREATE_COMPLETE AWS::SNS::Topic',
      'CREATE_COMPLETE AWS::CloudFormation::Stack'
    ];
    Stream(cfn, stackName)
      .on('data', (e) => {
        assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
        events.shift();
      })
      .on('end', () => {
        updateStack();
      });
  });

  function updateStack() {
    // Modify template for update.
    const templateUpdated = JSON.parse(JSON.stringify(template));
    templateUpdated.Resources.NewTopic = {
      'Type': 'AWS::SNS::Topic',
      'Properties' : {
        'DisplayName': 'Topic2'
      }
    };

    cfn.updateStack({
      StackName: stackName,
      TemplateBody: JSON.stringify(templateUpdated)
    }, (err) => {
      if (err) {
        assert.ifError(err);
        assert.end();
        return;
      }
      const events = [
        'UPDATE_IN_PROGRESS AWS::CloudFormation::Stack',
        'CREATE_IN_PROGRESS AWS::SNS::Topic',
        'CREATE_IN_PROGRESS AWS::SNS::Topic',
        'CREATE_COMPLETE AWS::SNS::Topic',
        'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS AWS::CloudFormation::Stack',
        'UPDATE_COMPLETE AWS::CloudFormation::Stack'
      ];
      Stream(cfn, stackName)
        .on('data', (e) => {
          assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
          events.shift();
        })
        .on('end', () => {
          deleteStack();
        });
    });
  }

  function deleteStack() {
    cfn.deleteStack({ StackName: stackName }, (err) => {
      assert.ifError(err);
      assert.end();
    });
  }
});

test('streams events during stack deletion', { timeout: 60000 }, (assert) => {
  const stackName = 'cfn-stack-event-stream-test-delete';
  let lastEventId;

  cfn.createStack({
    StackName: stackName,
    TemplateBody: JSON.stringify(template)
  }, (err, stack) => {
    if (err) {
      assert.ifError(err);
      assert.end();
      return;
    }
    Stream(cfn, stackName)
      .on('data', (e) => {
        lastEventId = e.EventId;
      })
      .on('end', () => {
        cfn.deleteStack({ StackName: stackName }, (err) => {
          if (err) {
            assert.ifError(err);
            assert.end();
            return;
          }
          const events = [
            'DELETE_IN_PROGRESS AWS::CloudFormation::Stack',
            'DELETE_IN_PROGRESS AWS::SNS::Topic',
            'DELETE_COMPLETE AWS::SNS::Topic',
            'DELETE_COMPLETE AWS::CloudFormation::Stack'
          ];
          Stream(cfn, stack.StackId, { lastEventId: lastEventId })
            .on('data', (e) => {
              assert.equal(events[0], e.ResourceStatus + ' ' + e.ResourceType, e.ResourceStatus + ' ' + e.ResourceType);
              events.shift();
            })
            .on('end', () => {
              assert.end();
            });
        });
      });
  });
});

