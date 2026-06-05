f=open('/root/genlayer-py/genlayer_py/types/transactions.py','r')
d=f.read()
f.close()

d=d.replace(
    '    "13": TransactionStatus.LEADER_TIMEOUT,\n}',
    '    "13": TransactionStatus.LEADER_TIMEOUT,\n    "14": TransactionStatus.UNDETERMINED,\n}'
)
d=d.replace(
    'TRANSACTION_STATUS_NUMBER_TO_NAME[str(self.status)].value',
    'TRANSACTION_STATUS_NUMBER_TO_NAME.get(str(self.status), TransactionStatus.UNDETERMINED).value'
)

f=open('/root/genlayer-py/genlayer_py/types/transactions.py','w')
f.write(d)
f.close()
print('OK')
