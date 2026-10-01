-- 25 candidate gauges with a daily rainfall measure (of 26 nearby)
begin;
create temp table _cand(ea_station_id text, name text, lat float, lon float, measure text, geom geometry) on commit drop;
insert into _cand values ('fd8ea26c-8052-48c5-a1bb-bbd5ebbbb3d3_364176','Austins Bridge',50.478522,-3.761327,'fd8ea26c-8052-48c5-a1bb-bbd5ebbbb3d3_364176-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.761327,50.478522),4326));
insert into _cand values ('8d954129-924c-47e3-8750-5f29a59617b2','Harbertonford Slipperstone',50.391542,-3.738644,'8d954129-924c-47e3-8750-5f29a59617b2-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.738644,50.391542),4326));
insert into _cand values ('31653dd5-c1ed-4091-a860-5e8d25936861','Bickington',50.537963,-3.702646,'31653dd5-c1ed-4091-a860-5e8d25936861-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.702646,50.537963),4326));
insert into _cand values ('b000c3f6-3922-48ea-8726-4173de4998d0','Holne Priddons Farm',50.516929,-3.841878,'b000c3f6-3922-48ea-8726-4173de4998d0-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.841878,50.516929),4326));
insert into _cand values ('d4553d75-862e-4436-8cfa-ff5b216f04bb','White Barrow',50.473224,-3.891407,'d4553d75-862e-4436-8cfa-ff5b216f04bb-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.891407,50.473224),4326));
insert into _cand values ('e7e2f7d4-f497-4adc-b077-c20bc2dcedfa','Torbay Compton',50.475569,-3.581185,'e7e2f7d4-f497-4adc-b077-c20bc2dcedfa-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.581185,50.475569),4326));
insert into _cand values ('de3285a5-0abf-4c5b-8ee2-63187f9124ae','Bovey Tracey',50.592312,-3.716672,'de3285a5-0abf-4c5b-8ee2-63187f9124ae-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.716672,50.592312),4326));
insert into _cand values ('a0dfcb85-6e73-4768-8e15-aaa2238dfd01_368090','Cornwood',50.418783,-3.959369,'a0dfcb85-6e73-4768-8e15-aaa2238dfd01_368090-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.959369,50.418783),4326));
insert into _cand values ('b69ee00c-aa73-49d0-bc62-ff4673094553','Dartmoor',50.548615,-3.938746,'b69ee00c-aa73-49d0-bc62-ff4673094553-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.938746,50.548615),4326));
insert into _cand values ('9dba2bf3-f5ea-4616-ac8e-dce16dbc0dc8','Brixham',50.384839,-3.524079,'9dba2bf3-f5ea-4616-ac8e-dce16dbc0dc8-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.524079,50.384839),4326));
insert into _cand values ('723a8fc4-908b-4430-91c7-9990be86540a_363307','Bellever Dartmoor',50.582553,-3.898638,'723a8fc4-908b-4430-91c7-9990be86540a_363307-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.898638,50.582553),4326));
insert into _cand values ('13398e87-4b24-4579-a952-3721131d2e67','Lee Moor',50.440724,-4.010202,'13398e87-4b24-4579-a952-3721131d2e67-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-4.010202,50.440724),4326));
insert into _cand values ('b779beab-751f-439d-bd30-0f79b866a399','Plympton',50.377413,-3.990435,'b779beab-751f-439d-bd30-0f79b866a399-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.990435,50.377413),4326));
insert into _cand values ('f0676423-f697-4dec-8958-440f335cce9a','Princetown',50.549567,-3.9994,'f0676423-f697-4dec-8958-440f335cce9a-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.9994,50.549567),4326));
insert into _cand values ('4e00b4e3-af60-47cf-afe7-b36ac774ca82','Ashcombe',50.60161,-3.531044,'4e00b4e3-af60-47cf-afe7-b36ac774ca82-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.531044,50.60161),4326));
insert into _cand values ('598e7d36-5ea6-4265-9d4b-d65e0e31ac8b','Dartmoor Fernworthy',50.626032,-3.90835,'598e7d36-5ea6-4265-9d4b-d65e0e31ac8b-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.90835,50.626032),4326));
insert into _cand values ('f37a0c9e-b91e-4ace-90bb-7d35af3855b5','Davey Park Farm',50.263658,-3.812093,'f37a0c9e-b91e-4ace-90bb-7d35af3855b5-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.812093,50.263658),4326));
insert into _cand values ('eb09e0d5-288f-438c-b817-d88461441f06','Dousland',50.501196,-4.060843,'eb09e0d5-288f-438c-b817-d88461441f06-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-4.060843,50.501196),4326));
insert into _cand values ('323b21d8-c9a4-4681-bc5c-62d7337993ac','Mardon Down',50.679934,-3.738651,'323b21d8-c9a4-4681-bc5c-62d7337993ac-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.738651,50.679934),4326));
insert into _cand values ('11a89f6e-a1ea-4386-92b7-db3e1f32d0da','Dawlish Warren',50.598233,-3.460623,'11a89f6e-a1ea-4386-92b7-db3e1f32d0da-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.460623,50.598233),4326));
insert into _cand values ('1059a35a-374e-4473-892d-e7aa0cc03602','Langstone Moor',50.586713,-4.052086,'1059a35a-374e-4473-892d-e7aa0cc03602-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-4.052086,50.586713),4326));
insert into _cand values ('62dab114-8bf5-497c-b2f6-9c699062004e','Crownhill',50.416807,-4.126097,'62dab114-8bf5-497c-b2f6-9c699062004e-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-4.126097,50.416807),4326));
insert into _cand values ('244025a2-dc9f-4360-a25c-fed437fa1916_369504','Mary Tavy',50.58658,-4.107361,'244025a2-dc9f-4360-a25c-fed437fa1916_369504-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-4.107361,50.58658),4326));
insert into _cand values ('92c2130e-641a-452a-a6ce-b0aba496e680','Exmouth Maer Lane',50.615029,-3.380588,'92c2130e-641a-452a-a6ce-b0aba496e680-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.380588,50.615029),4326));
insert into _cand values ('ea09488b-5d25-47cf-b24d-9d100104d432','East Okement',50.703743,-3.977585,'ea09488b-5d25-47cf-b24d-9d100104d432-rainfall-t-86400-mm-qualified',st_setsrid(st_makepoint(-3.977585,50.703743),4326));
create temp table _asset_gauge on commit drop as
  select a.id as asset_id, c.ea_station_id, c.name, c.lat, c.lon, c.measure
  from sewage_assets a
  cross join lateral (
     select * from _cand c
     where a.latitude is not null
     order by st_distance(c.geom::geography, st_setsrid(st_makepoint(a.longitude,a.latitude),4326)::geography)
     limit 1
  ) c
  where a.organisation_id='00000000-0000-0000-0000-000000000001'::uuid;
insert into rainfall_stations (organisation_id, name, ea_station_id, ea_measure_rainfall, latitude, longitude, ea_enabled)
  select distinct '00000000-0000-0000-0000-000000000001'::uuid, g.name, g.ea_station_id, g.measure, g.lat, g.lon, true
  from _asset_gauge g
  on conflict (organisation_id, ea_station_id) do update set
     ea_measure_rainfall = excluded.ea_measure_rainfall, ea_enabled = true;
update sewage_assets a set rainfall_station_id = rs.id
  from _asset_gauge g
  join rainfall_stations rs on rs.organisation_id='00000000-0000-0000-0000-000000000001'::uuid and rs.ea_station_id = g.ea_station_id
  where a.id = g.asset_id;
update rainfall_stations set ea_enabled = false
  where organisation_id='00000000-0000-0000-0000-000000000001'::uuid
    and id not in (select rainfall_station_id from sewage_assets where rainfall_station_id is not null);
select 'gauges used: ' || count(distinct ea_station_id) from _asset_gauge;
select 'assets mapped: ' || count(*) from sewage_assets where rainfall_station_id is not null and organisation_id='00000000-0000-0000-0000-000000000001'::uuid;
commit;
