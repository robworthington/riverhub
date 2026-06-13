-- River Hub — complete the Dart-catchment water-body taxonomy (with EA WFD IDs).
-- The initial seed had 7; the Dart catchment has ~20 river water bodies
-- (Hems, Harbourne, Mardle, Dean Burn, Swincombe, E/W Dart, E/W Webburn, …).

do $$
declare
  org uuid := '00000000-0000-0000-0000-000000000001';
  rec record;
begin
  -- guard: no-op on a fresh (non-FotD) instance where this org doesn't exist (federation F1/F6)
  if not exists (select 1 from organisations where id = org) then return; end if;
  for rec in
    select * from (values
      ('Dart',                                  'GB108046008350'),
      ('Dart (Tidal)',                          'GB108046005060'),
      ('East Dart River',                       'GB108046008420'),
      ('West Dart River (Upper)',               'GB108046008400'),
      ('West Dart River (Lower)',               'GB108046008340'),
      ('West Dart River (Blackbrook to Swincombe)', 'GB108046008361'),
      ('Swincombe',                             'GB108046005240'),
      ('Blackbrook River',                      'GB108046008370'),
      ('Cherry Brook',                          'GB108046008380'),
      ('East Webburn River',                    'GB108046008390'),
      ('West Webburn River',                    'GB108046008410'),
      ('Webburn',                               'GB108046005250'),
      ('Mardle',                                'GB108046005220'),
      ('Dean Burn',                             'GB108046005190'),
      ('Ashburn',                               'GB108046005270'),
      ('Bidwell Brook',                         'GB108046005160'),
      ('Hems - Upper',                          'GB108046005230'),
      ('Hems - Lower',                          'GB108046005430'),
      ('Harbourne River',                       'GB108046005170'),
      ('Wash',                                  'GB108046005080')
    ) as t(label, ea_id)
  loop
    if exists (select 1 from water_bodies where organisation_id = org and label = rec.label) then
      update water_bodies set ea_water_body_id = rec.ea_id
        where organisation_id = org and label = rec.label;
    else
      insert into water_bodies (organisation_id, code, label, ea_water_body_id)
        values (org, rec.ea_id, rec.label, rec.ea_id);
    end if;
  end loop;
end $$;
