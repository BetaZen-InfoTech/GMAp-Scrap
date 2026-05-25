// Mirrors SessionStatsRecord from the existing Electron admin.

class Session {
  final String? id;
  final String? sessionId;
  final String? jobId;
  final String? deviceId;
  final String? deviceName;
  final String? keyword;
  final int? pincode;
  final String? district;
  final String? stateName;
  final String? category;
  final String? subCategory;
  final List<int> rounds;
  final int totalRecords;
  final int insertedRecords;
  final int duplicateRecords;
  final int batchesSent;
  final String status; // 'completed' | 'error' | 'partial'
  final DateTime? startedAt;
  final DateTime? completedAt;
  final int durationMs;

  const Session({
    this.id,
    this.sessionId,
    this.jobId,
    this.deviceId,
    this.deviceName,
    this.keyword,
    this.pincode,
    this.district,
    this.stateName,
    this.category,
    this.subCategory,
    required this.rounds,
    required this.totalRecords,
    required this.insertedRecords,
    required this.duplicateRecords,
    required this.batchesSent,
    required this.status,
    this.startedAt,
    this.completedAt,
    required this.durationMs,
  });

  factory Session.fromJson(Map<String, dynamic> j) => Session(
        id: j['_id']?.toString(),
        sessionId: j['sessionId'] as String?,
        jobId: j['jobId'] as String?,
        deviceId: j['deviceId'] as String?,
        deviceName: j['deviceName'] as String?,
        keyword: j['keyword'] as String?,
        pincode: (j['pincode'] as num?)?.toInt(),
        district: j['district'] as String?,
        stateName: j['stateName'] as String?,
        category: j['category'] as String?,
        subCategory: j['subCategory'] as String?,
        rounds: (j['rounds'] as List?)?.map((e) => (e as num).toInt()).toList() ?? const [],
        totalRecords:     (j['totalRecords']     as num?)?.toInt() ?? 0,
        insertedRecords:  (j['insertedRecords']  as num?)?.toInt() ?? 0,
        duplicateRecords: (j['duplicateRecords'] as num?)?.toInt() ?? 0,
        batchesSent:      (j['batchesSent']      as num?)?.toInt() ?? 0,
        status: (j['status'] as String?) ?? 'completed',
        startedAt:   _date(j['startedAt']),
        completedAt: _date(j['completedAt']),
        durationMs: (j['durationMs'] as num?)?.toInt() ?? 0,
      );
}

class Job {
  final String? id;
  final String? jobId;
  final String? deviceId;
  final int? startPincode;
  final int? endPincode;
  final int totalSearches;
  final int completedSearches;
  final String status;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Job({
    this.id,
    this.jobId,
    this.deviceId,
    this.startPincode,
    this.endPincode,
    required this.totalSearches,
    required this.completedSearches,
    required this.status,
    this.createdAt,
    this.updatedAt,
  });

  factory Job.fromJson(Map<String, dynamic> j) => Job(
        id: j['_id']?.toString(),
        jobId: j['jobId'] as String?,
        deviceId: j['deviceId'] as String?,
        startPincode: (j['startPincode'] as num?)?.toInt(),
        endPincode:   (j['endPincode']   as num?)?.toInt(),
        totalSearches:     (j['totalSearches']     as num?)?.toInt() ?? 0,
        completedSearches: (j['completedSearches'] as num?)?.toInt() ?? 0,
        status: (j['status'] as String?) ?? 'running',
        createdAt: _date(j['createdAt']),
        updatedAt: _date(j['updatedAt']),
      );

  double get progressPercent {
    if (totalSearches == 0) return 0;
    return (completedSearches / totalSearches * 100).clamp(0, 100).toDouble();
  }
}

class ScrapedRecord {
  final String id;
  final String? name;
  final String? phone;
  final String? email;
  final String? website;
  final String? address;
  final String? category;
  final String? pincode;
  final double? rating;
  final int? reviews;
  final String? scrapKeyword;
  final String? scrapFrom;
  final bool isDuplicate;
  final bool scrapWebsite;

  const ScrapedRecord({
    required this.id,
    this.name,
    this.phone,
    this.email,
    this.website,
    this.address,
    this.category,
    this.pincode,
    this.rating,
    this.reviews,
    this.scrapKeyword,
    this.scrapFrom,
    required this.isDuplicate,
    required this.scrapWebsite,
  });

  factory ScrapedRecord.fromJson(Map<String, dynamic> j) => ScrapedRecord(
        id: j['_id']?.toString() ?? '',
        name: j['name'] as String?,
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        website: j['website'] as String?,
        address: j['address'] as String?,
        category: j['category'] as String?,
        pincode: j['pincode'] as String?,
        rating: (j['rating'] as num?)?.toDouble(),
        reviews: (j['reviews'] as num?)?.toInt(),
        scrapKeyword: j['scrapKeyword'] as String?,
        scrapFrom: j['scrapFrom'] as String?,
        isDuplicate: j['isDuplicate'] == true,
        scrapWebsite: j['scrapWebsite'] == true,
      );
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is String) return DateTime.tryParse(v);
  return null;
}
