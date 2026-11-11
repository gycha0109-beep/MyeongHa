"""A sandboxed client can only reach the local UNIX gateway, never the Internet."""
import argparse
import json
from local_socket_gateway import submit


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--socket',required=True)
    parser.add_argument('--request-id',required=True)
    args=parser.parse_args()
    reply=submit(args.socket,{'request_id':args.request_id,'role':'student',
        'model_id':'synthetic/deepseek','max_charge_micro_usd':40,
        'fixture':{'provider':'fake-provider','model':'synthetic/deepseek',
                   'actual_micro_usd':10,'successful':True}})
    if not reply.get('ok') or reply['result'].get('external_calls')!=0:
        raise RuntimeError('offline_gateway_request_failed')
    print(json.dumps({'mode':'unix-socket-client', 'reservation_accepted':True,
                      'external_calls':0,'role':'student'},sort_keys=True))

if __name__=='__main__':main()