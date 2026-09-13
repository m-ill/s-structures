// Project solver-owned section definitions without per-station copies.
// This preserves evidence; it does not interpolate or qualify an RC section.
export function selectNativeSectionProfile(row){
 const source=row?.taper||row?.sectionProfile;if(!source)return null;
 const {stationSections,...definition}=source;
 return {...structuredClone(definition),snapshotVersion:'p25-native-section-profile-v1',stationSectionsOmitted:true};
}
