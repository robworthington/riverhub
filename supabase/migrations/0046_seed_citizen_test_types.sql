-- River Hub — ensure the standard citizen-science bacteria test types exist for this instance's org.
-- Instances provisioned EA/EDM-first can lack the culture types that the water-quality classification
-- and analysis expect by exact name (E. coli (culture) / Intestinal enterococci (culture)). Idempotent:
-- adds only the ones missing for public_org().
insert into test_types (organisation_id, test_name, category, primary_unit)
select public_org(), v.name, 'biological'::test_category, 'CFU/100mL'
from (values ('E. coli (culture)'), ('E. coli (Petrifilm)'), ('Intestinal enterococci (culture)')) as v(name)
where public_org() is not null
  and not exists (select 1 from test_types t where t.organisation_id = public_org() and t.test_name = v.name);
