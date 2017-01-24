import assert from 'assert';
import { S3 } from 'aws-sdk';

import BucketUtility from '../../lib/utility/bucket-util';
import getConfig from '../support/config';
import withV4 from '../support/withV4';

// Change these locations with the config ones
const configLocationConstraints = {
    'aws-us-east-1': 'aws-us-east-1-value',
    'aws-us-east-test': 'aws-us-east-test-value',
    'scality-us-east-1': 'scality-us-east-1-value',
    'scality-us-west-1': 'scality-us-west-1-value',
    'virtual-user-metadata': 'virtual-user-metadata-value',
    'file': 'file-value',
    'mem': 'mem-value',
};

const AWSregions = ['us-west-1', 'us-west-2', 'ca-central-1',
'EU', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'ap-south-1', 'ap-southeast-1',
'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'sa-east-1',
'us-east-2'];

const bucketName = 'bucketlocation';

const describeSkipAWS = process.env.AWS_ON_AIR ? describe.skip : describe;

describe('PUT Bucket - AWS.S3.createBucket', () => {
    describe('When user is unauthorized', () => {
        let s3;
        let config;

        beforeEach(() => {
            config = getConfig('default');
            s3 = new S3(config);
        });

        it('should return 403 and AccessDenied', done => {
            const params = { Bucket: 'mybucket' };

            s3.makeUnauthenticatedRequest('createBucket', params, error => {
                assert(error);

                assert.strictEqual(error.statusCode, 403);
                assert.strictEqual(error.code, 'AccessDenied');

                done();
            });
        });
    });

    withV4(sigCfg => {
        let bucketUtil;

        before(() => {
            bucketUtil = new BucketUtility('default', sigCfg);
        });

        describe('bucket naming restriction', () => {
            let testFn;

            before(() => {
                testFn = (bucketName, done, errStatus, errCode) => {
                    const expectedStatus = errStatus || 400;
                    const expectedCode = errCode || 'InvalidBucketName';
                    bucketUtil
                        .createOne(bucketName)
                        .then(() => {
                            const e = new Error('Expect failure in creation, ' +
                                'but it succeeded');

                            return done(e);
                        })
                        .catch(error => {
                            assert.strictEqual(error.code, expectedCode);
                            assert.strictEqual(error.statusCode,
                                expectedStatus);
                            done();
                        });
                };
            });

            // Found that AWS has fewer restriction in naming than
            // they described in their document.
            // Hence it skips some of test suites.
            const itSkipIfAWS = process.env.AWS_ON_AIR ? it.skip : it;

            it('should return 405 if empty name', done => {
                const shortName = '';

                testFn(shortName, done, 405, 'MethodNotAllowed');
            });

            it('should return 400 if name is shorter than 3 chars', done => {
                const shortName = 'as';

                testFn(shortName, done);
            });

            itSkipIfAWS('should return 400 if name is longer than 63 chars',
                done => {
                    const longName = 'x'.repeat(64);
                    testFn(longName, done);
                }
            );

            itSkipIfAWS('should return 400 if name is formatted as IP address',
                done => {
                    const ipAddress = '192.168.5.4';
                    testFn(ipAddress, done);
                }
            );

            itSkipIfAWS('should return 400 if name starts with period',
                done => {
                    const invalidName = '.myawsbucket';
                    testFn(invalidName, done);
                }
            );

            it('should return 400 if name ends with period', done => {
                const invalidName = 'myawsbucket.';
                testFn(invalidName, done);
            });

            itSkipIfAWS(
                'should return 400 if name has two period between labels',
                done => {
                    const invalidName = 'my..examplebucket';
                    testFn(invalidName, done);
                }
            );

            it('should return 400 if name has special chars', done => {
                const invalidName = 'my.#s3bucket';
                testFn(invalidName, done);
            });
        });

        describe('bucket creation success', () => {
            function _test(name, done) {
                bucketUtil.s3.createBucket({ Bucket: name }, (err, res) => {
                    assert.ifError(err);
                    assert(res.Location, 'No Location in response');
                    assert.deepStrictEqual(res.Location, `/${name}`,
                      'Wrong Location header');
                    bucketUtil.deleteOne(name).then(() => done()).catch(done);
                });
            }
            it('should create bucket if name is valid', done =>
                _test('scality-very-valid-bucket-name', done));

            it('should create bucket if name is some prefix and an IP address',
                done => _test('prefix-192.168.5.4', done));

            it('should create bucket if name is an IP address with some suffix',
                done => _test('192.168.5.4-suffix', done));
        });
        Object.keys(configLocationConstraints).concat(AWSregions).forEach(
        location => {
            describeSkipAWS(`bucket creation with location: ${location}`,
            () => {
                after(done => bucketUtil.deleteOne(bucketName).then(() =>
                done()).catch(done));
                it(`should create bucket with location: ${location}`, done => {
                    bucketUtil.s3.createBucketAsync(
                        {
                            Bucket: bucketName,
                            CreateBucketConfiguration: {
                                LocationConstraint: location,
                            },
                        }, done);
                });
            });
        });

        describe('bucket creation with invalid location', () => {
            it('should return errors InvalidLocationConstraint', done => {
                bucketUtil.s3.createBucketAsync(
                    {
                        Bucket: bucketName,
                        CreateBucketConfiguration: {
                            LocationConstraint: 'coco',
                        },
                    }, err => {
                    assert.strictEqual(err.code,
                    'InvalidLocationConstraint');
                    assert.strictEqual(err.statusCode, 400);
                    done();
                });
            });
        });
    });
});
