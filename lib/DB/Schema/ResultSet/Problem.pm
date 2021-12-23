package DB::Schema::ResultSet::Problem;
use strict;
use warnings;
use base 'DBIx::Class::ResultSet';

use Clone qw/clone/;
use DB::Utils qw/getCourseInfo getSetInfo getProblemInfo updateAllFields/;

=head1 DESCRIPTION

This is the functionality of a Problem in WeBWorK.  This package is based on
C<DBIx::Class::ResultSet>.  The basics are a CRUD for problems in Problem sets.

=head2 getGlobalProblems

This gets a list of all problems stored in the database in the C<problems> table.

=head3 input, a hash of options

=over
=item - C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 output

An array of problems as either a hashref or a  C<DBIx::Class::ResultSet::Problem> object

=cut

sub getGlobalProblems {
	my ($self, %args) = @_;
	my @problems = $self->search({});

	return @problems if $args{as_result_set};
	return map {
		{
			$_->get_inflated_columns,
			set_name => $_->problem_set->set_name
		};
	} @problems;
}

###
#
# CRUD for problems in a course
#
###

=head1 getProblems

This gets all problems in a given course.

=head3 input,  a hash of options

=over

=item * C<info>, either a course name or course_id.

For example, C<{ course_name => 'Precalculus'}> or C<{course_id => 3}>

=item - C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or course_id doesn't exist, an error will be thrown.

=head3 output

An array of Problems (as hashrefs) or an array of C<DBIx::Class::ResultSet::Problem>

=cut

sub getProblems {
	my ($self, %args) = @_;
	my $course = $self->rs("Course")->getCourse(info => $args{info}, as_result_set => 1);

	my @problems =
		$self->search({ 'problem_set.course_id' => $course->course_id }, { join => [qw/problem_set/] });

	return @problems if $args{as_result_set};
	return map {
		{ $_->get_inflated_columns };
	} @problems;
}

=head1 getSetProblems

This gets all problems in a given set

=head3 input,  a hash of options

=over

=item * C<info>, a hash with

=over
=item - C<course_name> or C<course_id>
=item - C<set_name> or C<set_id>

=back

For example, C<{ course_name => 'Precalculus', set_id => 4}>
or C<{course_id => 3, set_name => 'HW #1'}>

=item * C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or set doesn't exist, an exception will be thrown.

=head3 output

An array of Problems (as hashrefs) or an array of C<DBIx::Class::ResultSet::Problem>

=cut

sub getSetProblems {
	my ($self, %args) = @_;

	my $problem_set = $self->rs("ProblemSet")->getProblemSet(info => $args{info}, as_result_set => 1);
	my @problems    = $self->search({ 'set_id' => $problem_set->set_id });

	return \@problems if $args{as_result_set};
	return map {
		{ $_->get_inflated_columns };
	} @problems;
}

=head2 getSetProblem

This gets a single problem from a given course and problem

=head3 input,  a hash of options

=over

=item * C<info>, a hash with

=over
=item - C<course_name> or C<course_id>
=item - C<set_name> or C<set_id>
=item - C<problem_number> or C<problem_id>

=back

For example, C<{ course_name => 'Precalculus', set_id => 4}>
or C<{course_id => 3, set_name => 'HW #1'}>

=item * C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or set doesn't exist, an exception will be thrown.

=head3 output

An array of Problems (as hashrefs) or an array of C<DBIx::Class::ResultSet::Problem>

=cut

sub getSetProblem {
	my ($self, %args) = @_;

	my $problem_set = $self->rs("ProblemSet")->getProblemSet(info => $args{info}, as_result_set => 1);

	my $problem      = $problem_set->problems->find(getProblemInfo($args{info}));

	return $problem if $args{as_result_set};
	return { $problem->get_inflated_columns };
}

=head2 addSetProblem

Add a single problem to an existing problem set within a course

=head3 input,  a hash of options

=over

=item * C<info>, a hash with

=over
=item - C<course_name> or C<course_id>
=item - C<set_name> or C<set_id>

=back

For example, C<{ course_name => 'Precalculus', set_id => 4}>
or C<{course_id => 3, set_name => 'HW #1'}>

=item * C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or set doesn't exist, an exception will be thrown.

=head3 output

An array of Problems (as hashrefs) or an array of C<DBIx::Class::ResultSet::Problem>

=cut

=head3 Note

=over

=item * If either the problem set or course does not exist an error will be thrown

=item * If the problem parameters are not valid, an error will be thrown.

=back

=cut

sub addSetProblem {
	my ($self, %args) = @_;
	my $problem_set = $self->rs("ProblemSet")->getProblemSet(info=>$args{info}, as_result_set => 1);
	# set the problem number to one more than the set's largest
	my $new_problem_params = clone($args{params});
	$new_problem_params->{problem_number} = 1 + ($problem_set->problems->get_column('problem_number')->max // 0);

	my $params = $new_problem_params->{problem_params} || {};
	$params->{weight} = 1 unless defined($params->{weight});

	$new_problem_params->{problem_params} = $params;

	my $problem_to_add = $self->new($new_problem_params);
	$problem_to_add->validParams('problem_params');

	my $added_problem = $problem_set->add_to_problems($new_problem_params);
	return $args{as_result_set} ? $added_problem : { $added_problem->get_inflated_columns };
}

=head2 updateSetProblem

update a single problem in a problem set within a course

=head3 input,  a hash of options

=over

=item * C<info>, a hash with

=over
=item - C<course_name> or C<course_id>
=item - C<set_name> or C<set_id>

=back

For example, C<{ course_name => 'Precalculus', set_id => 4}>
or C<{course_id => 3, set_name => 'HW #1'}>


=item * C<params>, a hash with fields/parameters from C<DB::Schema::Result::Problem>


=item * C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or set doesn't exist, an exception will be thrown.

=head3 output

A single Problem (as hashrefs) or an object of class C<DBIx::Class::ResultSet::Problem>

=cut

=head3 Note

=over

=item * If either the problem set or course does not exist an error will be thrown

=item * If the problem parameters are not valid, an error will be thrown.

=back

=cut

sub updateSetProblem {
	my ($self, %args) = @_;
	my $problem = $self->getSetProblem(info=>$args{info}, as_result_set => 1);
	my $params  = updateAllFields({ $problem->get_inflated_columns }, $args{params});

	## check that the new params are valid:
	my $updated_problem = $self->new($params);
	$updated_problem->validParams('problem_params');

	my $problem_to_return = $problem->update($params);
	return $args{as_result_set} ? $problem_to_return : { $problem_to_return->get_inflated_columns };
}

=head2 deleteSetProblem

delete a single problem to an existing problem set within a course

=head3 input,  a hash of options

=over

=item * C<info>, a hash with

=over
=item - C<course_name> or C<course_id>
=item - C<set_name> or C<set_id>
=item - C<problem_number> or C<problem_id>

=back

For example, C<{ course_name => 'Precalculus', set_id => 4}>
or C<{course_id => 3, set_name => 'HW #1'}>

=item * C<as_result_set>, a boolean.  If true this result an array of C<DBIx::Class::ResultSet::ProblemSet>
if false, an array of hashrefs of ProblemSet.

=back

=head3 notes:
if either the course or set doesn't exist, an exception will be thrown.

=head3 output

A problem (as hashrefs) or an object of class C<DBIx::Class::ResultSet::Problem>

=cut

sub deleteSetProblem {
	my ($self, %args) = @_;
	my $set_problem = $self->getSetProblem(info => $args{info}, as_result_set => 1);
	my $problem_set = $self->rs("ProblemSet")->getProblemSet(
		info => {
			course_id => $set_problem->problem_set->course_id,
			set_id => $set_problem->set_id
		}, as_result_set => 1);

	my $problem = $problem_set->search_related("problems", getProblemInfo($args{info}))->single;

	my $deleted_problem = $problem->delete;

	return $deleted_problem if $args{as_result_set};
	return { $deleted_problem->get_inflated_columns };

}

# just a small subroutine to shorten access to the db.

sub rs {
	my ($self, $table) = @_;
	return $self->result_source->schema->resultset($table);
}

1;
