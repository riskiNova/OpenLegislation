var billModule = angular.module('open.bill', ['open.core']);

billModule.filter('resolutionOrBill', function() {
    return function(input) {
        return (input) ? "Resolution" : "Bill";
    }
});

billModule.filter('prettyAmendVersion', function() {
    return function(input) {
        return (input) ? input : "Original";
    }
});

billModule.factory('BillListingApi', ['$resource', function($resource) {
    return $resource(apiPath + '/bills/:sessionYear', {
        sessionYear: '@sessionYear'
    });
}]);

billModule.factory('BillSearchApi', ['$resource', function($resource) {
    return $resource(apiPath + '/bills/search/?term=:term&sort=:sort&limit=:limit&offset=:offset', {
        term: '@term',
        sort: '@sort',
        limit: '@limit',
        offset: '@offset'
    });
}]);

billModule.factory('BillGetApi', ['$resource', function($resource) {
    return $resource(apiPath + '/bills/:session/:printNo?detail=true', {
        session: '@session',
        printNo: '@printNo'
    });
}]);

billModule.factory('BillUpdatesApi', ['$resource', function($resource) {
    return $resource(apiPath + '/bills/:session/:printNo/updates?order=:order&filter=:filter&limit=:limit&offset=:offset', {
        session: '@session',
        printNo: '@printNo',
        order: '@order',
        filter: '@filter',
        limit: '@limit',
        offset: '@offset'
    });
}]);

billModule.factory('BillDiffApi', ['$resource', function($resource) {
    return $resource(apiPath + '/bills/:session/:printNo/diff/:version1/:version2/', {
        session: '@session',
        printNo: '@printNo',
        version1: '@version1',
        version2: '@version2'
    });
}]);

/** --- Parent Bill Controller --- */

billModule.controller('BillCtrl', ['$scope', '$rootScope', '$location', '$route',
                       function($scope, $rootScope, $location, $route) {

    /**
     * Returns a formatted, all lower case string representing the latest milestone status.
     *
     * @param milestones
     * @returns {string}
     */
    $scope.getMilestoneDesc = function(milestones) {
        if (milestones && milestones.size > 0) {
            var milestone = milestones.items.slice(-1)[0];
            var desc = $scope.getStatusDesc(milestone);
            return desc.toLocaleLowerCase();
        }
        return "Introduced";
    };

    $scope.getMilestoneDate = function(milestones) {
        if (milestones && milestones.size > 0) {
            var milestone = milestones.items.slice(-1)[0];
            return moment(milestone.actionDate).format("MMMM DD, YYYY");
        }
    };

    $scope.getStatusDesc = function(status) {
        var desc = "";
        if (status) {
            switch (status.statusType) {
                case "IN_SENATE_COMM":
                    desc = "In Senate " + status.committeeName + " Committee"; break;
                case "IN_ASSEMBLY_COMM":
                    desc = "In Assembly " + status.committeeName + " Committee"; break;
                case "SENATE_FLOOR":
                    desc = "On Senate Floor as Calendar No: " + status.billCalNo; break;
                case "ASSEMBLY_FLOOR":
                    desc = "On Assembly Floor as Calendar No: " + status.billCalNo; break;
                default:
                    desc = status.statusDesc;
            }
        }
        return desc;
    }
}]);

/** --- Bill Search Controller --- */

billModule.controller('BillSearchCtrl', ['$scope', '$filter', '$routeParams', '$location','BillListingApi', 'BillSearchApi',
                      function($scope, $filter, $routeParams, $location, BillListing, BillSearch) {
    $scope.setHeaderText('NYS Bills and Resolutions');
    $scope.selectedView = parseInt($routeParams.view, 10) || 0;

    $scope.billSearch = {
        searched: false,
        term: $routeParams.search || '',
        response: {},
        results: [],
        totalResultCount: 0,
        limit: 6,
        offset: 1,
        page: 1
    };

    $scope.init = function() {
        if ($scope.billSearch.term != '') {
            $scope.simpleSearch();
        }
    };

    $scope.simpleSearch = function() {
        var term = $scope.billSearch.term;
        if (term) {
            $location.search("search", $scope.billSearch.term);
            $scope.billSearch.searched = false;
            $scope.billSearch.response = BillSearch.get({
                term: term, sort: $scope.billSearch.sort, limit: $scope.billSearch.limit, offset: $scope.billSearch.offset},
                function() {
                    $scope.billSearch.results = $scope.billSearch.response.result.items || [];
                    $scope.billSearch.totalResultCount = $scope.billSearch.response.total;
                    $scope.billSearch.searched = true;
                });
        }
        else {
            $scope.billSearch.results = [];
            $scope.billSearch.totalResultCount = 0;
        }
    };

    /**
     * Gets the full bill view for a specified printNo and session year.
     * @param printNo {string}
     * @param session {int}
     */
    $scope.getBill = function(printNo, session) {
        if (printNo && session) {
            $scope.billViewResult = BillView.get({printNo: printNo, session: session}, function() {
                if ($scope.billViewResult.success) {
                    $scope.billView = $scope.billViewResult.result;
                }
            });
        }
    };

    $scope.nextPage = function() {
        if ($scope.billSearch.totalResultCount > ($scope.billSearch.offset + $scope.billSearch.limit - 1)) {
            $scope.billSearch.page += 1;
            $scope.billSearch.offset += $scope.billSearch.limit;
            $location.search('page', $scope.billSearch.page);
            $scope.simpleSearch();
        }
    };

    $scope.computeOffset = function(page) {
        return ((page - 1) * $scope.limit) + 1;
    };

    $scope.init();
}]);

/** --- Bill View Controller --- */

billModule.controller('BillViewCtrl', ['$scope', '$filter', '$location', '$routeParams', '$sce',
                                       'BillGetApi', 'BillDiffApi', 'BillUpdatesApi',
    function($scope, $filter, $location, $routeParams, $sce, BillGetApi, BillDiffApi, BillUpdatesApi) {

    $scope.response = null;
    $scope.bill = null;
    $scope.curr = {
        amdVersion: '',
        compareVersion: 'None',
        selectedView: (parseInt($routeParams.view, 10) || 1),
        updateTypeFilter: '',
        updateOrder: 'desc'
    };
    $scope.diffHtml = null;
    $scope.updateHistory = null;

    $scope.$watch('curr.selectedView', function() {
        $location.search('view', $scope.curr.selectedView);
    });

    $scope.init = function() {
        $scope.session = $routeParams.session;
        $scope.printNo = $routeParams.printNo;
        $scope.response = BillGetApi.get({printNo: $scope.printNo, session: $scope.session}, function() {
            if ($scope.response.success) {
                $scope.bill = $scope.response.result;
                $scope.setHeaderText('NYS ' + $scope.bill.billType.desc + ' ' +
                    $filter('resolutionOrBill')($scope.bill.billType.resolution) + ' ' +
                    $scope.bill.basePrintNo + '-' + $scope.bill.session);
                $scope.curr.amdVersion = $scope.bill.activeVersion;
            }
        }, function(response) {
            $scope.setHeaderText(response.data.message);
            $scope.response = response.data;
        });
    }();

    $scope.diffBills = function() {
        if ($scope.curr.compareVersion !== 'None') {
            $scope.diffResponse = BillDiffApi.get({
                printNo: $scope.bill.printNo, session: $scope.bill.session,
                version1: $scope.curr.compareVersion.trim(), version2: $scope.curr.amdVersion},
            function() {
                $scope.diffHtml = $sce.trustAsHtml($scope.diffResponse.result.diffHtml);
            });
        }
        else {
            $scope.diffHtml = null;
        }
    };

    $scope.initialGetUpdates = function() {
        if ($scope.updateHistory === null) {
          $scope.getUpdates();
        }
    };

    $scope.getUpdates = function() {
        $scope.updateHistoryResponse = BillUpdatesApi.get(
            {printNo: $scope.printNo, session: $scope.session, order: $scope.curr.updateOrder,
             filter: $scope.curr.updateTypeFilter, offset: 1, limit: 200}, function() {
            if ($scope.updateHistoryResponse.success === true) {
                $scope.updateHistory = $scope.updateHistoryResponse.result;
            }
        });
    };

    $scope.backToSearch = function() {
        $location.search('view', 0);
        $location.path(ctxPath + '/bills');
    };

    /**
     * The milestones array from the bill api response only includes data for milestones that have been met. This
     * method will return an array such that any missing milestones are also included (with null actionDates).
     * @returns {Array}
     */
    $scope.getPaddedMilestones = function() {
        var milestoneArr = [];
        if ($scope.bill) {
            milestoneArr = $scope.defaultBillMilestones($scope.bill.billType.chamber);
            // Replacing part of the arrays that overlap.. maybe there is a cleaner way?
            [].splice.apply(milestoneArr, [0, $scope.bill.milestones.size].concat($scope.bill.milestones.items));
        }
        return milestoneArr;
    };

    /**
     * Returns an array of default milestones for a bill.
     * @param chamber String - SENATE or ASSEMBLY
     * @returns {Array}
     */
    $scope.defaultBillMilestones = function(chamber) {
        var milestoneArr = [];
        var createMilestone = function(desc) {
            return {statusDesc: desc, actionDate: null};
        };
        var senateMilestones = [
            createMilestone("In Senate Committee"),
            createMilestone("On Senate Floor"),
            createMilestone("Passed Senate")
        ];
        var assemblyMilestones = [
            createMilestone("In Assembly Committee"),
            createMilestone("On Assembly Floor"),
            createMilestone("Passed Assembly")
        ];
        if (chamber == 'SENATE') {
            milestoneArr = milestoneArr.concat(senateMilestones).concat(assemblyMilestones);
        }
        else {
            milestoneArr = milestoneArr.concat(assemblyMilestones).concat(senateMilestones);
        }
        milestoneArr = milestoneArr.concat([
            createMilestone("Sent to Governor"),
            createMilestone("Signed Into Law")]);
        return milestoneArr;
    }
}]);

/** --- Filters --- */

billModule.filter('prettySponsorMemo', function($sce){
    var headingPattern = /(([A-Z][A-Za-z ]+)+:)/g;
    return function(memo) {
        if (memo) {
            var htmlMemo = memo.replace(headingPattern, "<div class='bill-memo-heading'>$1</div>");
            return $sce.trustAsHtml(htmlMemo);
        }
        return memo;
    }
});

billModule.filter('voteTypeFilter', function() {
    return function(voteType) {
        switch (voteType) {
            case 'AYE': return 'Aye';
            case 'NAY': return 'Nay';
            case 'AYEWR': return 'Aye with reservations';
            case 'ABS': return 'Absent';
            case 'ABD': return 'Abstained';
            case 'EXC': return 'Excused';
            default: return 'Unknown';
        }
    }
});
