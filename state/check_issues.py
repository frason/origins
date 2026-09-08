import json,sys
data = json.load(open(sys.argv[1]))
ids = [155,156,157,158,159,160,161,163,165,166,167,168,171,172,120,121,122,123,124,125,126,262,271,270,274,275,277,268,267,266,265,264,276,278,269,272,263]
by_id = {d['number']: d for d in data}
for i in ids:
    d = by_id.get(i)
    if d:
        labels = ",".join(l['name'] for l in d['labels'])
        print(str(i) + "\t" + d['state'] + "\t" + labels + "\t" + d['title'])
    else:
        print(str(i) + "\tMISSING")
